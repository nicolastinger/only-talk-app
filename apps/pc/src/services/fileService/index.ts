import { open } from '@tauri-apps/plugin-dialog';
import { FileVo } from '@workspace/types';
import { invoke } from '@tauri-apps/api/core'; // 文件管理器选择文件

// 文件管理器选择文件
export const selectFile = async (
  isMultiple: boolean = false,
  isDirectory: boolean = false,
): Promise<string[] | null> => {
  try {
    // 打开文件选择器（支持单文件选择）
    const filePath = await open({
      multiple: isMultiple, // 是否允许多选（false=单选）
      directory: isDirectory, // 是否选择目录（false=文件）
      filters: [
        { name: 'All Files', extensions: ['*'] }, // 文件过滤器
      ],
    });

    // filePath 是绝对路径（例如：C:/Users/user/file.txt 或 /home/user/file.txt）
    console.log('Selected file path:', filePath);
    return filePath ? [filePath] : null;
  } catch (error) {
    console.error('File selection failed:', error);
    return null;
  }
};

// 传入业务id获取图片文件
export const getImageFiles = async (
  bizId: string,
): Promise<FileVo[] | null> => {
  try {
    let files = [] as FileVo[];
    const FileVos: FileVo[] = await invoke('get_file_by_biz_id', {
      bizId,
    });

    if (FileVos.length > 0) {
      FileVos.forEach((file) => {
        const bytes = file.raw;
        if (bytes && bytes.length > 0) {
          // 将二进制数据转换为Base64字符串，然后创建data URL
          const uint8Array = new Uint8Array(bytes);
          const blob = new Blob([uint8Array], {
            type: FileVos[0].mime_type || 'image/webp',
          });
          
          file.blob_url = URL.createObjectURL(blob);
          files.push(file);
        }
      });
    }
    return files;
  } catch (error: any) {
    console.error('Get image files failed:', error);
    return null;
  }
};
