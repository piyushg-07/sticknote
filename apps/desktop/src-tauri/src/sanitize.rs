//! HTML sanitisation for note bodies.
//!
//! Note bodies are rich text produced by a `contenteditable` editor. Every
//! body that enters the store — from the editor, from disk, or from an
//! import — passes through `clean_html`, so the webviews only ever render a
//! tiny allow-listed subset of HTML with no scripts, styles, or event handlers.

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

fn builder() -> &'static ammonia::Builder<'static> {
    static B: OnceLock<ammonia::Builder<'static>> = OnceLock::new();
    B.get_or_init(|| {
        let tags: HashSet<&str> = [
            "div", "p", "br", "b", "strong", "i", "em", "u", "s", "strike", "a", "ul", "ol", "li",
        ]
        .into_iter()
        .collect();

        let mut tag_attrs: HashMap<&str, HashSet<&str>> = HashMap::new();
        tag_attrs.insert("a", ["href"].into_iter().collect());
        tag_attrs.insert("li", ["data-checked"].into_iter().collect());

        let mut classes: HashMap<&str, HashSet<&str>> = HashMap::new();
        classes.insert("ul", ["checklist"].into_iter().collect());

        let mut b = ammonia::Builder::empty();
        b.tags(tags)
            .tag_attributes(tag_attrs)
            .allowed_classes(classes)
            .url_schemes(["http", "https", "mailto"].into_iter().collect())
            .link_rel(Some("noopener noreferrer"))
            .strip_comments(true);
        b
    })
}

/// Sanitise an untrusted HTML fragment.
pub fn clean_html(input: &str) -> String {
    builder().clean(input).to_string()
}

/// Derive a plain-text projection from *sanitised* HTML. Block boundaries
/// become newlines, list items get a readable prefix.
pub fn html_to_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut chars = html.char_indices().peekable();
    let mut list_stack: Vec<(bool, u32, bool)> = Vec::new(); // (ordered, counter, checklist)

    while let Some((i, c)) = chars.next() {
        if c == '<' {
            let end = match html[i..].find('>') {
                Some(e) => i + e,
                None => break,
            };
            let tag = &html[i + 1..end];
            let closing = tag.starts_with('/');
            let name: String = tag
                .trim_start_matches('/')
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric())
                .collect::<String>()
                .to_ascii_lowercase();
            match (name.as_str(), closing) {
                ("br", _) => out.push('\n'),
                ("div" | "p", false) => newline(&mut out),
                ("div" | "p", true) => newline(&mut out),
                ("ul", false) => list_stack.push((false, 0, tag.contains("checklist"))),
                ("ol", false) => list_stack.push((true, 0, false)),
                ("ul" | "ol", true) => {
                    list_stack.pop();
                    newline(&mut out);
                }
                ("li", false) => {
                    newline(&mut out);
                    if let Some(top) = list_stack.last_mut() {
                        if top.2 {
                            out.push_str(if tag.contains("data-checked=\"true\"") {
                                "[x] "
                            } else {
                                "[ ] "
                            });
                        } else if top.0 {
                            top.1 += 1;
                            out.push_str(&format!("{}. ", top.1));
                        } else {
                            out.push_str("- ");
                        }
                    }
                }
                _ => {}
            }
            // advance iterator past the tag
            while let Some(&(j, _)) = chars.peek() {
                if j > end {
                    break;
                }
                chars.next();
            }
        } else if c == '&' {
            let rest = &html[i..];
            let (decoded, len) = decode_entity(rest);
            out.push_str(&decoded);
            for _ in 1..len {
                chars.next();
            }
        } else {
            out.push(c);
        }
    }

    // collapse 3+ newlines and trim
    let mut collapsed = String::with_capacity(out.len());
    let mut nl = 0;
    for c in out.trim().chars() {
        if c == '\n' {
            nl += 1;
            if nl > 2 {
                continue;
            }
        } else {
            nl = 0;
        }
        collapsed.push(c);
    }
    collapsed
}

fn newline(out: &mut String) {
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
}

fn decode_entity(s: &str) -> (String, usize) {
    const TABLE: &[(&str, &str)] = &[
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", "\""),
        ("&#39;", "'"),
        ("&apos;", "'"),
        ("&nbsp;", " "),
    ];
    for (ent, val) in TABLE {
        if s.starts_with(ent) {
            return (val.to_string(), ent.chars().count());
        }
    }
    // numeric entities
    if let Some(stripped) = s.strip_prefix("&#") {
        if let Some(end) = stripped.find(';').filter(|e| *e <= 8) {
            let num = &stripped[..end];
            let code = if let Some(hex) = num.strip_prefix(['x', 'X']) {
                u32::from_str_radix(hex, 16).ok()
            } else {
                num.parse::<u32>().ok()
            };
            if let Some(ch) = code.and_then(char::from_u32) {
                return (ch.to_string(), end + 3);
            }
        }
    }
    ("&".into(), 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_scripts_and_handlers() {
        let out = clean_html(r#"<div onclick="x()">hi<script>alert(1)</script><img src=x onerror=alert(1)></div>"#);
        assert_eq!(out, "<div>hi</div>");
    }

    #[test]
    fn keeps_checklists_and_safe_links() {
        let out = clean_html(
            r#"<ul class="checklist evil"><li data-checked="true">a</li></ul><a href="javascript:alert(1)">x</a><a href="https://a.b">y</a>"#,
        );
        assert!(out.contains(r#"<ul class="checklist">"#));
        assert!(out.contains(r#"data-checked="true""#));
        assert!(!out.contains("javascript"));
        assert!(out.contains(r#"href="https://a.b""#));
    }

    #[test]
    fn text_projection() {
        let t = html_to_text("<div>Title &amp; more</div><ul><li>a</li><li>b</li></ul><ol><li>x</li></ol>");
        assert_eq!(t, "Title & more\n- a\n- b\n1. x");
    }
}
