#![cfg(test)]

use app_lib::utils::image_utils::compress_image_to_webp;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;

#[test]
fn test_compress_real_image_p1017533() {
    let input_path = PathBuf::from(r"D:\漫展\P1002642.JPG");
    
    assert!(input_path.exists(), "Input file should exist");
    
    let input_size = fs::metadata(&input_path).unwrap().len();
    println!("Input file size: {} bytes ({:.2} MB)", input_size, input_size as f64 / 1024.0 / 1024.0);
    
    let result = compress_image_to_webp(&input_path);
    
    match result {
        Ok(file) => {
            println!("Compression succeeded!");
            let output_path = input_path.with_extension("webp");
            let output_size = fs::metadata(&output_path).unwrap().len();
            println!("Output file size: {} bytes ({:.2} KB)", output_size, output_size as f64 / 1024.0);
            
            assert!(output_size <= 200 * 1024, "Output size should be <= 200KB, got {} bytes", output_size);
            
            let mut file_handle = fs::File::open(&output_path).unwrap();
            let mut header = [0u8; 4];
            file_handle.read_exact(&mut header).unwrap();
            assert_eq!(&header, b"RIFF", "WebP file should start with RIFF");
            
            fs::remove_file(&output_path).ok();
        }
        Err(e) => {
            panic!("Compression failed: {:?}", e);
        }
    }
}
