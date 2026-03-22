use std::fs;
use std::path::PathBuf;

use image::{DynamicImage, ImageBuffer, Rgba};

fn main() {
    println!("创建测试图片...");

    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join("test_image.jpg");

    let width = 1920u32;
    let height = 1080u32;

    println!("图片尺寸: {}x{}", width, height);

    let mut img = ImageBuffer::new(width, height);

    for y in 0..height {
        for x in 0..width {
            let r = ((x as f32 / width as f32) * 255.0) as u8;
            let g = ((y as f32 / height as f32) * 255.0) as u8;
            let b = 128u8;
            let a = 255u8;
            img.put_pixel(x, y, Rgba([r, g, b, a]));
        }
    }

    let dynamic_img = DynamicImage::ImageRgba8(img);

    let start = std::time::Instant::now();
    dynamic_img.save(&output_path).unwrap();
    let save_time = start.elapsed();

    let file_size = fs::metadata(&output_path).unwrap().len();

    println!("✓ 测试图片创建成功!");
    println!("  路径: {}", output_path.display());
    println!("  大小: {} bytes ({:.2} KB)", file_size, file_size as f64 / 1024.0);
    println!("  保存耗时: {:?}", save_time);
}
