import { open } from '@tauri-apps/plugin-dialog';
import { FileVo } from '@workspace/types';
import { invoke } from '@tauri-apps/api/core';

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
