import { open, save } from '@tauri-apps/plugin-dialog';

// 文件管理器选择文件
export const selectFile = async (isMultiple: boolean = false, isDirectory: boolean = false): Promise<string[] | null> => {
  try {
    // 打开文件选择器（支持单文件选择）
    const filePath = await open({
      multiple: isMultiple, // 是否允许多选（false=单选）
      directory: isDirectory, // 是否选择目录（false=文件）
      filters: [
        { name: 'All Files', extensions: ['*'] }, // 文件过滤器
      ]
    });

    // filePath 是绝对路径（例如：C:/Users/user/file.txt 或 /home/user/file.txt）
    console.log('Selected file path:', filePath);
    return filePath ? [filePath] : null;
  } catch (error) {
    console.error('File selection failed:', error);
    return null;
  }
}