import { open } from '@tauri-apps/plugin-dialog';
import { FileVo } from '@workspace/types';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

/**
 * 选择文件
 * @param isMultiple 是否多选
 * @param isDirectory 是否选择目录
 * @returns 文件路径列表
 */
export const selectFile = async (
  isMultiple: boolean = false,
  isDirectory: boolean = false,
): Promise<string[] | null> => {
  try {
    const filePath = await open({
      multiple: isMultiple,
      directory: isDirectory,
      filters: [
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    console.log('Selected file path:', filePath);
    return filePath ? [filePath] : null;
  } catch (error) {
    console.error('File selection failed:', error);
    return null;
  }
};

/**
 * 转换文件绝对路径为tauri文件路径
 * @param absolutePath 文件绝对路径
 * @returns tauri文件路径
 */
export const convertPathToTauriUrl = (absolutePath: string): string | null => {
  try {
    return convertFileSrc(absolutePath);
  } catch (error) {
    console.error('Convert path to tauri url failed:', error);
    return null;
  }
};

/**
 * 获取文件列表
 * @param bizId 业务ID
 * @returns 文件列表
 */
export const getFiles = async (
  bizId: string,
): Promise<FileVo[] | null> => {
  try {
    let files = [] as FileVo[];
    const FileVos: FileVo[] = await invoke('get_file_by_biz_id', {
      bizId,
    });

    if (FileVos.length > 0) {
      FileVos.forEach((file) => {
        const tauriFilePath = convertPathToTauriUrl(file.original_file_path || '');
        if (tauriFilePath) {
          file.tauri_file_path = tauriFilePath;
          files.push(file);
        }
      });
    }
    return files;
  } catch (error: any) {
    console.error('Get files failed:', error);
    return null;
  }
};
