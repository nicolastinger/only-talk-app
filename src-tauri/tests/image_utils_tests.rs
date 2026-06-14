#![cfg(test)]

use app_lib::utils::image_utils::compress_image_to_webp;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

fn create_test_image() -> PathBuf {
    let temp_dir = std::env::temp_dir();
    let path = temp_dir.join("test_input.png");

    let width = 800u32;
    let height = 600u32;
    let img = image::RgbaImage::from_pixel(width, height, image::Rgba([100, 150, 200, 255]));
    img.save(&path).unwrap();

    path
}

#[test]
fn test_compress_image_to_webp_success() {
    let input_path = create_test_image();

    let result = compress_image_to_webp(&input_path);

    assert!(result.is_ok(), "Compression should succeed: {:?}", result.err());

    let output_path = input_path.with_extension("webp");
    assert!(output_path.exists(), "Output file should exist");

    let output_size = fs::metadata(&output_path).unwrap().len();
    assert!(output_size <= 200 * 1024, "Output size should be <= 200KB, got {} bytes", output_size);

    fs::remove_file(&input_path).ok();
    fs::remove_file(&output_path).ok();
}

#[test]
fn test_compress_image_to_webp_exceeds_max_input_size() {
    let temp_dir = std::env::temp_dir();
    let large_path = temp_dir.join("large_test_input.png");

    {
        let mut file = fs::File::create(&large_path).unwrap();
        let zeros = vec![0u8; 101 * 1024 * 1024];
        file.write_all(&zeros).unwrap();
    }

    let result = compress_image_to_webp(&large_path);

    assert!(result.is_err(), "Should fail for input > 100MB");
    assert!(result.unwrap_err().to_string().contains("100MB"));

    fs::remove_file(&large_path).ok();
}

#[test]
fn test_compress_image_output_is_webp() {
    let input_path = create_test_image();

    let result = compress_image_to_webp(&input_path);

    assert!(result.is_ok());

    let output_path = input_path.with_extension("webp");
    let mut file = fs::File::open(&output_path).unwrap();
    let mut header = [0u8; 4];
    use std::io::Read;
    file.read_exact(&mut header).unwrap();

    assert_eq!(&header, b"RIFF", "WebP file should start with RIFF");

    fs::remove_file(&input_path).ok();
    fs::remove_file(&output_path).ok();
}

#[test]
fn test_compress_image_preserves_aspect_ratio() {
    let temp_dir = std::env::temp_dir();
    let input_path = temp_dir.join("rect_test.png");

    let width = 1600u32;
    let height = 900u32;
    let img = image::RgbaImage::from_pixel(width, height, image::Rgba([255, 0, 0, 255]));
    img.save(&input_path).unwrap();

    let result = compress_image_to_webp(&input_path);

    assert!(result.is_ok(), "Compression should succeed: {:?}", result.err());

    let output_path = input_path.with_extension("webp");
    let loaded = image::open(&output_path).unwrap();

    let output_width = loaded.width() as f64;
    let output_height = loaded.height() as f64;
    let original_ratio = width as f64 / height as f64;
    let output_ratio = output_width / output_height;

    let ratio_diff = (original_ratio - output_ratio).abs();
    assert!(
        ratio_diff < 0.01,
        "Aspect ratio should be preserved: original={}, output={}",
        original_ratio,
        output_ratio
    );

    fs::remove_file(&input_path).ok();
    fs::remove_file(&output_path).ok();
}
