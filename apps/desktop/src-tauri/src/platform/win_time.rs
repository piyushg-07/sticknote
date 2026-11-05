//! Local-calendar arithmetic for repeating reminders, using Windows' own
//! time-zone rules: "daily at 9:00" stays at 9:00 local time across
//! daylight-saving changes, and "monthly on the 31st" clamps to short months.

use windows_sys::Win32::Foundation::{FILETIME, SYSTEMTIME};
use windows_sys::Win32::System::Time::{
    FileTimeToSystemTime, SystemTimeToFileTime, SystemTimeToTzSpecificLocalTime, TzSpecificLocalTimeToSystemTime,
};

/// Milliseconds between 1601-01-01 (FILETIME epoch) and 1970-01-01.
const EPOCH_DIFF_MS: u64 = 11_644_473_600_000;

fn ms_to_ft(ms: u64) -> FILETIME {
    let t = (ms + EPOCH_DIFF_MS) * 10_000;
    FILETIME { dwLowDateTime: t as u32, dwHighDateTime: (t >> 32) as u32 }
}

fn ft_to_ms(ft: FILETIME) -> u64 {
    let t = ((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64;
    (t / 10_000).saturating_sub(EPOCH_DIFF_MS)
}

/// UTC ms → local wall-clock SYSTEMTIME.
unsafe fn to_local(ms: u64) -> Option<SYSTEMTIME> {
    let ft = ms_to_ft(ms);
    let mut utc: SYSTEMTIME = std::mem::zeroed();
    let mut local: SYSTEMTIME = std::mem::zeroed();
    (FileTimeToSystemTime(&ft, &mut utc) != 0 && SystemTimeToTzSpecificLocalTime(std::ptr::null(), &utc, &mut local) != 0)
        .then_some(local)
}

/// Local wall-clock SYSTEMTIME → UTC ms.
unsafe fn from_local(local: &SYSTEMTIME) -> Option<u64> {
    let mut utc: SYSTEMTIME = std::mem::zeroed();
    let mut ft: FILETIME = std::mem::zeroed();
    (TzSpecificLocalTimeToSystemTime(std::ptr::null(), local, &mut utc) != 0 && SystemTimeToFileTime(&utc, &mut ft) != 0)
        .then(|| ft_to_ms(ft))
}

/// Same local time of day, `days` later.
pub fn add_local_days(ms: u64, days: u32) -> u64 {
    unsafe {
        let Some(local) = to_local(ms) else { return ms + days as u64 * 86_400_000 };
        // Step the wall-clock date as if it were UTC (no DST inside), then
        // map that wall-clock time back through the real time zone.
        let mut ft: FILETIME = std::mem::zeroed();
        if SystemTimeToFileTime(&local, &mut ft) == 0 {
            return ms + days as u64 * 86_400_000;
        }
        let shifted = ms_to_ft(ft_to_ms(ft) + days as u64 * 86_400_000);
        let mut next: SYSTEMTIME = std::mem::zeroed();
        if FileTimeToSystemTime(&shifted, &mut next) == 0 {
            return ms + days as u64 * 86_400_000;
        }
        from_local(&next).unwrap_or(ms + days as u64 * 86_400_000)
    }
}

/// Same local day-of-month and time, one month later (clamped to month length).
pub fn add_local_month(ms: u64) -> u64 {
    unsafe {
        let Some(mut local) = to_local(ms) else { return ms + 30 * 86_400_000 };
        let (y, m) = if local.wMonth == 12 { (local.wYear + 1, 1) } else { (local.wYear, local.wMonth + 1) };
        local.wYear = y;
        local.wMonth = m;
        local.wDay = local.wDay.min(days_in_month(y, m));
        from_local(&local).unwrap_or(ms + 30 * 86_400_000)
    }
}

/// Local day of week, 0 = Sunday … 6 = Saturday.
pub fn local_weekday(ms: u64) -> u16 {
    unsafe { to_local(ms).map(|l| l.wDayOfWeek).unwrap_or(((ms / 86_400_000 + 4) % 7) as u16) }
}

fn days_in_month(y: u16, m: u16) -> u16 {
    match m {
        2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}
