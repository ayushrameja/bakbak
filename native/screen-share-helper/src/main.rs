use std::io;

use bakbak_screen_share_helper::{
    model::{HelperError, MAX_LINE_BYTES, Request},
    protocol::{Outbound, failure},
    runtime::HelperRuntime,
};
use tokio::{
    io::{AsyncBufRead, AsyncBufReadExt, AsyncWriteExt, BufReader},
    sync::mpsc,
};
use zeroize::Zeroize;

#[tokio::main]
async fn main() {
    let (outbound_sender, mut outbound_receiver) = mpsc::unbounded_channel::<Outbound>();
    let writer = tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();
        while let Some(message) = outbound_receiver.recv().await {
            let Ok(mut encoded) = serde_json::to_vec(&message) else {
                continue;
            };
            encoded.push(b'\n');
            if stdout.write_all(&encoded).await.is_err() || stdout.flush().await.is_err() {
                break;
            }
            encoded.zeroize();
        }
    });

    let mut runtime = HelperRuntime::new(outbound_sender.clone());
    let mut stdin = BufReader::new(tokio::io::stdin());
    loop {
        let mut line = match read_bounded_line(&mut stdin).await {
            Ok(Some(BoundedLine::Line(line))) => line,
            Ok(Some(BoundedLine::TooLarge)) => {
                let _ = outbound_sender.send(failure(
                    "unknown".into(),
                    HelperError::invalid(
                        "request-too-large",
                        "The helper request exceeded the 32 MiB limit.",
                    ),
                ));
                continue;
            }
            Ok(None) => break,
            Err(_) => {
                eprintln!("bakbak helper: stdin became unavailable");
                break;
            }
        };
        let parsed = serde_json::from_slice::<Request>(&line);
        line.zeroize();
        let request = match parsed {
            Ok(request) => request,
            Err(_) => {
                let _ = outbound_sender.send(failure(
                    "unknown".into(),
                    HelperError::invalid("invalid-json", "The helper request is invalid JSON."),
                ));
                continue;
            }
        };
        if runtime.handle(request).await {
            break;
        }
    }
    drop(runtime);
    drop(outbound_sender);
    let _ = writer.await;
}

enum BoundedLine {
    Line(Vec<u8>),
    TooLarge,
}

async fn read_bounded_line<R: AsyncBufRead + Unpin>(
    reader: &mut R,
) -> io::Result<Option<BoundedLine>> {
    let mut line = Vec::new();
    let mut too_large = false;
    loop {
        let available = reader.fill_buf().await?;
        if available.is_empty() {
            return if line.is_empty() && !too_large {
                Ok(None)
            } else if too_large {
                Ok(Some(BoundedLine::TooLarge))
            } else {
                Ok(Some(BoundedLine::Line(line)))
            };
        }
        let consumed = available
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|index| index + 1)
            .unwrap_or(available.len());
        if !too_large {
            if line.len().saturating_add(consumed) > MAX_LINE_BYTES {
                line.zeroize();
                line.clear();
                too_large = true;
            } else {
                line.extend_from_slice(&available[..consumed]);
            }
        }
        let ended = available.get(consumed.saturating_sub(1)) == Some(&b'\n');
        reader.consume(consumed);
        if ended {
            if too_large {
                return Ok(Some(BoundedLine::TooLarge));
            }
            while matches!(line.last(), Some(b'\n' | b'\r')) {
                line.pop();
            }
            return Ok(Some(BoundedLine::Line(line)));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bounded_reader_rejects_oversized_lines_and_recovers() {
        let mut input = vec![b'x'; MAX_LINE_BYTES + 1];
        input.extend_from_slice(b"\n{}\n");
        let mut reader = BufReader::new(input.as_slice());
        assert!(matches!(
            read_bounded_line(&mut reader).await.unwrap(),
            Some(BoundedLine::TooLarge)
        ));
        match read_bounded_line(&mut reader).await.unwrap() {
            Some(BoundedLine::Line(line)) => assert_eq!(line, b"{}"),
            _ => panic!("expected the next line"),
        }
    }
}
