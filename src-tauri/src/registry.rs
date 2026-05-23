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
    
    let url = option_env!("AIVEN_DB_URL").unwrap_or("mysql://mock_user:mock_pass@mock_host:25060/defaultdb");
    let pool = MySqlPool::connect(url).await.map_err(|e| e.to_string())?;
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

    Ok(pool)
}

#[command]
pub fn get_device_id() -> String {
    // Cross-platform: Returns "MacBook-Pro" or "WIN-98745"
    gethostname().to_string_lossy().into_owned()
}

#[command]
pub async fn create_sync_group() -> Result<(String, String), String> {
    let pool = get_pool().await?;
    let group_id = Uuid::new_v4().to_string();
    
    // Generate random 6-digit PIN
    let pin = {
        let mut rng = rand::thread_rng();
        format!("{:06}", rng.gen_range(100000..999999))
    };
    let device_id = get_device_id();

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
pub async fn join_sync_group(pin: String) -> Result<String, String> {
    let pool = get_pool().await?;
    let device_id = get_device_id();

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
pub async fn leave_sync_group(group_id: String) -> Result<(), String> {
    let pool = get_pool().await?;
    let device_id = get_device_id();

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