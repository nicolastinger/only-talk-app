use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;
use fast_log::plugin::file_split::{DateType, KeepType, Rolling, RollingType};
use fast_log::plugin::packer::LogPacker;
use fast_log::Config;
use log::{error, info, LevelFilter};
use tauri::{Manager, Wry};

use crate::config::{init_persisted_config, set_config};
use crate::dao::init_common_db::init_common_sqlite;
use crate::utils::global_static_str::{
    get_env, APP_PATH, DEFAULT_IMAGE, LOG_FILE_NAME, LOG_PATH, MONTHLY_RESOURCE_PATH,
    RESOURCE_PATH, SQLITE_PATH,
};

pub async fn init_app(
    root_path: PathBuf,
    _app_handle: Option<tauri::AppHandle<Wry>>,
) -> Result<(), anyhow::Error> {
    // 获取应用的路径(挂载运行环境 {env} 段, 如 prod/dev/test)
    let env = get_env();
    let app_path = root_path.join(&env);
    info!("运行环境: {}, 应用数据路径: {:?}", env, app_path);
    let app_path = app_path.to_str().expect("获取应用路径失败");
    set_config(APP_PATH, app_path);
    // 获取日志路径
    let log_dir = Path::new(app_path).join(LOG_PATH);
    println!("Android 日志路径: {:?}", log_dir);
    set_config(LOG_PATH, log_dir.to_str().expect("转换路径失败"));

    if !log_dir.exists() {
        if let Err(e) = fs::create_dir_all(&log_dir) {
            eprintln!("创建日志目录失败: {}", e);
        } else {
            println!("已创建日志目录: {:?}", log_dir);
        }
    }
    let log_file_path = log_dir.join(LOG_FILE_NAME);
    println!("Android 日志路径: {:?}", log_file_path);

    // 启动时分割历史日志(避免 fast_log 直接追加到旧文件)
    split_history_log(log_file_path.to_str().expect("转换路径失败"));

    // 初始化日志
    init_log(log_file_path.to_str().expect("转换路径失败"));

    // 初始化资源文件夹
    let resource_path = Path::new(&app_path).join(RESOURCE_PATH);
    set_config(RESOURCE_PATH, resource_path.to_str().expect("转换路径失败"));

    // 检查目录是否存在，不存在则新建
    if !resource_path.exists() {
        fs::create_dir(&resource_path).expect("创建文件目录失败");
        info!("已创建目录: {}", RESOURCE_PATH);
    }

    // 检测并创建当月资源文件夹
    let monthly_folder_name = Local::now().format("%Y-%m").to_string();
    let monthly_resource_path = resource_path.join(&monthly_folder_name);
    if !monthly_resource_path.exists() {
        fs::create_dir(&monthly_resource_path).expect("创建当月资源目录失败");
        info!("已创建当月资源目录: {}", monthly_folder_name);
    } else {
        info!("当月资源目录已存在: {}", monthly_folder_name);
    }

    set_config(MONTHLY_RESOURCE_PATH, monthly_resource_path.to_str().expect("转换路径失败"));

    // 初始化sqlite文件夹
    let sqlite_path = Path::new(&app_path).join(SQLITE_PATH);
    set_config(SQLITE_PATH, sqlite_path.to_str().expect("转换路径失败"));
    if !sqlite_path.exists() {
        fs::create_dir(&sqlite_path).expect("创建文件目录失败");
        info!("已创建目录: {}", SQLITE_PATH);
    }
    // 初始化公共数据库
    init_common_sqlite(sqlite_path).await.expect("初始化公共数据库失败!");

    // 初始化并加载持久化配置(client_config 表 → 内存), 供 talk_api_base()/主题/语言解析
    init_persisted_config().await.expect("初始化持久化配置失败!");

    // // 复制打包的资源文件到可访问目录（移动平台需要）
    // if let Some(handle) = app_handle {
    //     copy_resources_to_app_dir(&handle, &resource_path).await;
    // }

    // 监测ipv6是否支持延后到登录成功后执行(check_ipv6_support)，
    // 因为 NAT UDP 端口需登录后从 API 动态获取
    info!("应用启动成功");
    Ok(())
}

/// 复制打包的资源文件到应用可访问的目录
#[allow(dead_code)]
async fn copy_resources_to_app_dir(app_handle: &tauri::AppHandle<Wry>, target_dir: &Path) {
    use tauri::path::BaseDirectory;

    info!("开始复制资源文件...");

    // 尝试从资源目录复制默认图片
    let resource_file_path = match app_handle
        .path()
        .resolve(format!("{}/{}", RESOURCE_PATH, DEFAULT_IMAGE), BaseDirectory::Resource)
    {
        Ok(path) => {
            info!("解析到的资源文件路径: {:?}", path);
            path
        }
        Err(e) => {
            error!("解析资源文件路径失败: {}", e);
            return;
        }
    };

    let source_path = Path::new(&resource_file_path);
    let target_path = target_dir.join(DEFAULT_IMAGE);

    info!("源资源路径: {:?}", source_path);
    info!("目标资源路径: {:?}", target_path);
    info!("源文件是否存在: {}", source_path.exists());
    info!("目标文件是否存在: {}", target_path.exists());

    // 如果目标文件已存在，跳过复制
    if target_path.exists() {
        info!("资源文件已存在，跳过复制");
        return;
    }

    // 尝试复制文件
    if source_path.exists() {
        match fs::copy(source_path, &target_path) {
            Ok(bytes) => {
                info!("成功复制资源文件: {:?} ({} bytes)", target_path, bytes);
            }
            Err(e) => {
                error!("复制资源文件失败: {}", e);
                // 尝试列出打包目录中的文件
                if let Ok(resource_dir) =
                    app_handle.path().resolve(RESOURCE_PATH, BaseDirectory::Resource)
                {
                    info!("资源目录: {:?}", resource_dir);
                    if let Ok(entries) = fs::read_dir(&resource_dir) {
                        for entry in entries.flatten() {
                            info!("资源目录中的文件: {:?}", entry.path());
                        }
                    }
                }
            }
        }
    } else {
        error!("源资源文件不存在: {:?}", source_path);
        // 尝试列出资源目录
        if let Ok(resource_dir) = app_handle.path().resolve(RESOURCE_PATH, BaseDirectory::Resource)
        {
            info!("尝试列出资源目录: {:?}", resource_dir);
            if resource_dir.exists() {
                if let Ok(entries) = fs::read_dir(&resource_dir) {
                    for entry in entries.flatten() {
                        info!("找到文件: {:?}", entry.path());
                    }
                }
            } else {
                error!("资源目录不存在: {:?}", resource_dir);
            }
        }
    }
}

// 启动时把上一次运行遗留的日志(修改日期早于今天)按最后修改时间重命名,
// 否则 fast_log 会直接追加到旧文件, 导致日志不按天分割。
fn split_history_log(log_file_path: &str) {
    use std::io::Write;

    let path = Path::new(log_file_path);
    let Ok(meta) = fs::metadata(path) else {
        return;
    };
    if !meta.is_file() {
        return;
    }
    let Ok(modified) = meta.modified() else {
        return;
    };
    let modified: chrono::DateTime<Local> = modified.into();
    if modified.date_naive() >= Local::now().date_naive() {
        return;
    }

    let suffix =
        path.extension().and_then(|e| e.to_str()).map(|e| format!(".{}", e)).unwrap_or_default();
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("only_talk");
    let rotated_path = path.with_file_name(format!(
        "{}{}{}",
        stem,
        modified.format("%Y-%m-%dT%H-%M-%S%.6f"),
        suffix
    ));

    if rotated_path.exists() {
        let merged = match (fs::read(path), fs::OpenOptions::new().append(true).open(&rotated_path))
        {
            (Ok(content), Ok(mut dst)) => dst.write_all(&content).is_ok(),
            _ => false,
        };
        if merged {
            let _ = fs::remove_file(path);
        }
    } else {
        let _ = fs::rename(path, &rotated_path);
    }
}

// 初始化日志
pub fn init_log(log_file_path: &str) {
    fast_log::init(
        Config::new()
            .console()
            .level(LevelFilter::Info)
            .file_split(
                log_file_path,
                Rolling::new(RollingType::ByDate(DateType::Day)),
                KeepType::KeepNum(30),
                LogPacker {},
            )
            .chan_len(Some(10)),
    )
    .expect("初始化日志失败");

    info!("日志初始化完成");
}
