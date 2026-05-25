// src-tauri/src/registry.rs
// forcing recompile
use tauri::command;
use gethostname::gethostname;
use sqlx::{MySqlPool, Row};
use std::sync::OnceLock;
use uuid::Uuid;
use rand::Rng;

static MYSQL_POOL: OnceLock<MySqlPool> = OnceLock::new();

async fn get_pool() -> Result<MySqlPool, String> {
    if let Some(pool) = MYSQL_POOL.get() {
        return Ok(pool.clone());
    }
    
    let mut url = option_env!("AIVEN_DB_URL").map(String::from);
    if url.is_none() {
        let toml_paths = ["src-tauri/.cargo/config.toml", ".cargo/config.toml"];
        for path in toml_paths {
            if let Ok(content) = std::fs::read_to_string(path) {
                for line in content.lines() {
                    let clean = line.trim();
                    if clean.starts_with("AIVEN_DB_URL") {
                        if let Some(eq_idx) = clean.find('=') {
                            let val_str = &clean[eq_idx+1..];
                            if let Some(q1) = val_str.find('"') {
                                if let Some(q2) = val_str[q1 + 1..].find('"') {
                                    url = Some(val_str[q1 + 1 .. q1 + 1 + q2].to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
                if url.is_some() { break; }
            }
        }
    }
    
    let final_url = url.unwrap_or_else(|| "mysql://mock_user:mock_pass@mock_host:25060/defaultdb".to_string());

    // println!(">>> DEBUG DB URL: {}", final_url);
    
    let pool = MySqlPool::connect(&final_url).await.map_err(|e| e.to_string())?;
    let _ = MYSQL_POOL.set(pool.clone());
    
    // Auto-migrate tables if they don't exist
    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS device_groups (
            group_id VARCHAR(36) PRIMARY KEY,
            pin VARCHAR(6) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(&pool).await;

    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS group_members (
            device_id VARCHAR(100) PRIMARY KEY,
            group_id VARCHAR(36),
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(&pool).await;

    let _ = sqlx::query(
        "CREATE TABLE IF NOT EXISTS cookie_transfers (
            pin VARCHAR(6) PRIMARY KEY,
            cookies TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(&pool).await;

    Ok(pool)
}

#[command]
pub async fn request_cookie_transfer() -> Result<String, String> {
    let pool = get_pool().await?;
    let pin = format!("{:06}", rand::thread_rng().gen_range(100000..999999));
    sqlx::query("INSERT INTO cookie_transfers (pin) VALUES (?)")
        .bind(&pin).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(pin)
}

#[command]
pub async fn submit_cookie_transfer(pin: String, cookies: String) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query("UPDATE cookie_transfers SET cookies = ? WHERE pin = ?")
        .bind(&cookies).bind(&pin).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn poll_cookie_transfer(pin: String) -> Result<Option<String>, String> {
    let pool = get_pool().await?;
    let row = sqlx::query("SELECT cookies FROM cookie_transfers WHERE pin = ?")
        .bind(&pin).fetch_optional(&pool).await.map_err(|e| e.to_string())?;
    
    if let Some(record) = row {
        let cookies: Option<String> = record.get("cookies");
        if cookies.is_some() {
            // Delete immediately after successful pull to keep it secure
            let _ = sqlx::query("DELETE FROM cookie_transfers WHERE pin = ?").bind(&pin).execute(&pool).await;
        }
        Ok(cookies)
    } else {
        Ok(None)
    }
}

#[command]
pub fn get_device_id() -> String {
    // Cross-platform: Returns "MacBook-Pro" or "WIN-98745"
    gethostname().to_string_lossy().into_owned()
}

#[command]
pub async fn create_sync_group(device_id: String) -> Result<(String, String), String> {
    let pool = get_pool().await?;
    let group_id = Uuid::new_v4().to_string();
    
    // Generate random 6-digit PIN
    let pin = {
        let mut rng = rand::thread_rng();
        format!("{:06}", rng.gen_range(100000..999999))
    };

    // Insert Group
    sqlx::query("INSERT INTO device_groups (group_id, pin) VALUES (?, ?)")
        .bind(&group_id)
        .bind(&pin)
        .execute(&pool).await.map_err(|e| e.to_string())?;

    // Bind this device as the leader
    sqlx::query("INSERT INTO group_members (device_id, group_id) VALUES (?, ?)")
        .bind(&device_id)
        .bind(&group_id)
        .execute(&pool).await.map_err(|e| e.to_string())?;

    Ok((group_id, pin))
}

#[command]
pub async fn join_sync_group(pin: String, device_id: String) -> Result<String, String> {
    let pool = get_pool().await?;

    // Find the group by PIN
    let row = sqlx::query("SELECT group_id FROM device_groups WHERE pin = ?")
        .bind(&pin)
        .fetch_optional(&pool).await.map_err(|e| e.to_string())?;

    if let Some(record) = row {
        let group_id: String = record.get("group_id");
        
        // Bind this device
        sqlx::query("INSERT INTO group_members (device_id, group_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE group_id = ?")
            .bind(&device_id)
            .bind(&group_id)
            .bind(&group_id)
            .execute(&pool).await.map_err(|e| e.to_string())?;
            
        Ok(group_id)
    } else {
        Err("Invalid PIN or Group not found".to_string())
    }
}

#[command]
pub async fn leave_sync_group(group_id: String, device_id: String) -> Result<(), String> {
    let pool = get_pool().await?;

    let token = option_env!("VMA_API_TOKEN").unwrap_or("MISSING_TOKEN");
    let api_url = "https://pan.vma.cc/pan/api.php";
    let filename = format!("{}_{}.bin", group_id, device_id);

    let client = reqwest::Client::new();
    if let Ok(list_res) = client.get(format!("{}?action=list", api_url)).header("Authorization", format!("Bearer {}", token)).send().await {
        if let Ok(list_json) = list_res.json::<serde_json::Value>().await {
            if let Some(items_array) = list_json["data"]["items"].as_array() {
                for file in items_array {
                    if file["name"].as_str().unwrap_or("") == filename {
                        if let Some(hash) = file["hash"].as_str() {
                            let delete_url = format!("{}?action=delete&api_key={}&hash={}", api_url, token, hash);
                            let _ = client.post(&delete_url).send().await;
                        }
                    }
                }
            }
        }
    }

    // 1. Remove this device from the group
    sqlx::query("DELETE FROM group_members WHERE device_id = ? AND group_id = ?")
        .bind(&device_id)
        .bind(&group_id)
        .execute(&pool).await.map_err(|e| e.to_string())?;

    // 2. Check how many members are left in this group
    let row = sqlx::query("SELECT COUNT(*) as c FROM group_members WHERE group_id = ?")
        .bind(&group_id)
        .fetch_one(&pool).await.map_err(|e| e.to_string())?;
        
    let count: i64 = row.get("c");

    // 3. If the group is empty, delete it permanently
    if count == 0 {
        sqlx::query("DELETE FROM device_groups WHERE group_id = ?")
            .bind(&group_id)
            .execute(&pool).await.map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[command]
pub async fn get_group_pin(group_id: String) -> Result<String, String> {
    let pool = get_pool().await?;
    let row = sqlx::query("SELECT pin FROM device_groups WHERE group_id = ?")
        .bind(&group_id)
        .fetch_optional(&pool).await.map_err(|e| e.to_string())?;

    if let Some(record) = row {
        let pin: String = record.get("pin");
        Ok(pin)
    } else {
        Err("Group not found".to_string())
    }
}