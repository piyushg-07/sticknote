//! Real icons for the app catalog (the catalog itself lives in the frontend:
//! src/lib/apps.ts). For each requested exe we find where it is installed and
//! extract its icon as a PNG data URL. Apps that aren't installed get no icon
//! (the UI shows a branded letter tile instead).
//!
//! Where an exe is looked up (built once, in the background, then cached):
//!  1. the "App Paths" registry (Office, browsers, many installers)
//!  2. standard install folders, two levels deep:
//!     %LOCALAPPDATA%\Programs, %LOCALAPPDATA%, %ProgramFiles%, %ProgramFiles(x86)%
//!  3. apps seen in front since Peekin started

use super::win::recent_app_paths;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use windows_sys::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS,
};
use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
use windows_sys::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

const MAX_REQUEST: usize = 400; // the catalog has ~170 apps

/// lower-case exe name → full path, for exes found in install folders.
static INDEX: OnceLock<HashMap<String, PathBuf>> = OnceLock::new();
/// lower-case exe name → icon data URL (None = not installed / no icon).
static ICONS: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

/// Icons for the given exe names, in the same order.
pub fn app_icons(exes: Vec<String>) -> Vec<(String, Option<String>)> {
    exes.into_iter()
        .take(MAX_REQUEST)
        .map(|exe| {
            let exe = exe.to_ascii_lowercase();
            if let Some(hit) = ICONS.lock().as_ref().and_then(|m| m.get(&exe).cloned()) {
                return (exe, hit);
            }
            let icon = locate(&exe).and_then(|p| unsafe { icon_data_url(&p) });
            ICONS.lock().get_or_insert_with(HashMap::new).insert(exe.clone(), icon.clone());
            (exe, icon)
        })
        .collect()
}

fn locate(exe: &str) -> Option<PathBuf> {
    if let Some(p) = registry_app_path(exe) {
        return Some(p);
    }
    if let Some(p) = INDEX.get_or_init(build_index).get(exe) {
        return Some(p.clone());
    }
    recent_app_paths().into_iter().find(|(n, _)| n == exe).map(|(_, p)| PathBuf::from(p))
}

// ---- 1. App Paths registry ----------------------------------------------------------

fn registry_app_path(exe: &str) -> Option<PathBuf> {
    let key: Vec<u16> = format!("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{exe}")
        .encode_utf16()
        .chain(Some(0))
        .collect();
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        if let Some(v) = unsafe { reg_default_string(root, &key) } {
            let p = PathBuf::from(v.trim().trim_matches('"'));
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

unsafe fn reg_default_string(root: HKEY, subkey: &[u16]) -> Option<String> {
    let mut buf = [0u16; 1024];
    let mut size = (buf.len() * 2) as u32;
    let rc = RegGetValueW(
        root,
        subkey.as_ptr(),
        std::ptr::null(),
        RRF_RT_REG_SZ,
        std::ptr::null_mut(),
        buf.as_mut_ptr() as *mut c_void,
        &mut size,
    );
    if rc != 0 {
        return None;
    }
    let len = (size as usize / 2).saturating_sub(1).min(buf.len());
    Some(String::from_utf16_lossy(&buf[..len]))
}

// ---- 2. install folders (scanned once) ----------------------------------------------------

fn build_index() -> HashMap<String, PathBuf> {
    let mut index = HashMap::new();
    let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
    let local = env("LOCALAPPDATA");
    let roots = [
        local.as_ref().map(|l| l.join("Programs")),
        local.clone(),
        env("ProgramFiles"),
        env("ProgramFiles(x86)"),
    ];
    for root in roots.into_iter().flatten() {
        scan(&root, 2, &mut index);
    }
    index
}

/// Collect *.exe files up to `depth` folders below `dir` (first match wins).
fn scan(dir: &Path, depth: u32, index: &mut HashMap<String, PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else { continue };
        let path = entry.path();
        if kind.is_dir() {
            if depth > 0 {
                scan(&path, depth - 1, index);
            }
        } else if kind.is_file() {
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if name.ends_with(".exe") {
                index.entry(name).or_insert(path);
            }
        }
    }
}

// ---- icon extraction: large shell icon → RGBA → PNG data URL ------------------------------

unsafe fn icon_data_url(path: &Path) -> Option<String> {
    let wide: Vec<u16> = path.as_os_str().to_string_lossy().encode_utf16().chain(Some(0)).collect();
    let mut info: SHFILEINFOW = std::mem::zeroed();
    let ok = SHGetFileInfoW(wide.as_ptr(), 0, &mut info, std::mem::size_of::<SHFILEINFOW>() as u32, SHGFI_ICON | SHGFI_LARGEICON);
    if ok == 0 || info.hIcon.is_null() {
        return None;
    }
    let rgba = icon_rgba(info.hIcon);
    DestroyIcon(info.hIcon);
    let (w, h, px) = rgba?;
    let png = encode_png(w, h, &px)?;
    Some(format!("data:image/png;base64,{}", base64(&png)))
}

unsafe fn icon_rgba(icon: HICON) -> Option<(u32, u32, Vec<u8>)> {
    let mut ii: ICONINFO = std::mem::zeroed();
    if GetIconInfo(icon, &mut ii) == 0 {
        return None;
    }
    let result = (|| {
        if ii.hbmColor.is_null() {
            return None; // monochrome icon: let the UI use a letter tile
        }
        let mut bm: BITMAP = std::mem::zeroed();
        if GetObjectW(ii.hbmColor, std::mem::size_of::<BITMAP>() as i32, &mut bm as *mut _ as *mut c_void) == 0 {
            return None;
        }
        let (w, h) = (bm.bmWidth.max(1) as u32, bm.bmHeight.max(1) as u32);
        if w > 256 || h > 256 {
            return None;
        }
        let color = dib_bits(ii.hbmColor, w, h)?;
        let has_alpha = color.chunks_exact(4).any(|p| p[3] != 0);
        let mask = if has_alpha { None } else { dib_bits(ii.hbmMask, w, h) };
        let mut px = Vec::with_capacity((w * h * 4) as usize);
        for (i, p) in color.chunks_exact(4).enumerate() {
            let a = if has_alpha {
                p[3]
            } else {
                match &mask {
                    Some(m) if m[i * 4] != 0 => 0, // white in the AND mask = transparent
                    _ => 255,
                }
            };
            px.extend_from_slice(&[p[2], p[1], p[0], a]); // BGRA → RGBA
        }
        Some((w, h, px))
    })();
    if !ii.hbmColor.is_null() {
        DeleteObject(ii.hbmColor);
    }
    if !ii.hbmMask.is_null() {
        DeleteObject(ii.hbmMask);
    }
    result
}

/// 32-bit top-down BGRA pixels of a bitmap.
unsafe fn dib_bits(bmp: *mut c_void, w: u32, h: u32) -> Option<Vec<u8>> {
    let mut bi: BITMAPINFO = std::mem::zeroed();
    bi.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: w as i32,
        biHeight: -(h as i32),
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB,
        ..std::mem::zeroed()
    };
    let mut buf = vec![0u8; (w * h * 4) as usize];
    let dc = GetDC(std::ptr::null_mut());
    let lines = GetDIBits(dc, bmp, 0, h, buf.as_mut_ptr() as *mut c_void, &mut bi, DIB_RGB_COLORS);
    ReleaseDC(std::ptr::null_mut(), dc);
    (lines != 0).then_some(buf)
}

fn encode_png(w: u32, h: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    Some(out)
}

fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        s.push(T[(n >> 18) as usize & 63] as char);
        s.push(T[(n >> 12) as usize & 63] as char);
        s.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        s.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    s
}
