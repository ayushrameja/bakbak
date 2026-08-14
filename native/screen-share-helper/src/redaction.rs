const REDACTED: &str = "[REDACTED]";

pub fn sanitize_external_error(input: impl AsRef<str>) -> String {
    let input = input.as_ref();
    let mut output = String::with_capacity(input.len().min(512));
    for (index, word) in input.split_whitespace().enumerate() {
        if index > 0 {
            output.push(' ');
        }
        if looks_like_jwt(word) {
            output.push_str(REDACTED);
        } else if word.starts_with("wss://") || word.starts_with("https://") {
            output.push_str(&sanitize_url_word(word));
        } else {
            output.push_str(word);
        }
        if output.len() >= 512 {
            output.truncate(512);
            break;
        }
    }
    if output.is_empty() {
        "Native operation failed.".to_string()
    } else {
        output
    }
}

fn looks_like_jwt(word: &str) -> bool {
    let trimmed = word.trim_matches(|character: char| {
        matches!(character, '"' | '\'' | ',' | ';' | '(' | ')' | '[' | ']')
    });
    let parts = trimmed.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts.iter().all(|part| {
            part.len() >= 8
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        })
}

fn sanitize_url_word(word: &str) -> String {
    let trailing = word
        .chars()
        .rev()
        .take_while(|character| matches!(character, ',' | ';' | ')' | ']'))
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    let core = word.trim_end_matches([',', ';', ')', ']']);
    match url::Url::parse(core) {
        Ok(mut url) => {
            let _ = url.set_username("");
            let _ = url.set_password(None);
            url.set_query(None);
            url.set_fragment(None);
            format!("{url}{trailing}")
        }
        Err(_) => REDACTED.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_tokens_and_url_credentials_from_external_errors() {
        let token = "abcdefgh.ijklmnop.qrstuvwx";
        let error = format!(
            "connect {token} via wss://alice:secret@example.test/rtc?access_token={token} failed"
        );
        let sanitized = sanitize_external_error(error);
        assert!(!sanitized.contains(token));
        assert!(!sanitized.contains("alice"));
        assert!(!sanitized.contains("secret"));
        assert!(!sanitized.contains("access_token"));
        assert!(sanitized.contains("[REDACTED]"));
        assert!(sanitized.contains("wss://example.test/rtc"));
    }
}
