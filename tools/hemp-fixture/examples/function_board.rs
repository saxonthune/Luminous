#![allow(dead_code)]

const DEFAULT_LIMIT: usize = 3;

enum Command { Fetch { limit: usize }, Preview, Clear }
struct Client { enabled: bool }
impl Client {
    fn fetch(&self, limit: usize) -> Result<Vec<usize>, String> {
        Ok((0..limit).collect())
    }
    fn clear(&self) {}
}
fn record(total: usize) { let _ = total; }

/// Process a command using an injected client and record its result.
fn process_command(client: &Client, command: Command) -> Result<usize, String> {
    let limit = DEFAULT_LIMIT;
    if !client.enabled {
        return Err("client disabled".into());
    }
    let mut total = 0;
    match command {
        Command::Fetch { limit: requested } if requested > 0 => {
            let values = client.fetch(requested)?;
            for value in values {
                if value % 2 == 0 {
                    total += value;
                }
            }
        }
        Command::Preview => {
            let adjust = |value: usize| value + limit;
            total = adjust(1);
        }
        _ => { client.clear(); }
    }
    record(total);
    Ok(total)
}

fn main() {
    let client = Client { enabled: true };
    let _ = process_command(&client, Command::Fetch { limit: 5 });
}
