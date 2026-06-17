import { open } from "@tauri-apps/plugin-dialog";
import { FileVo, Page, TextQuicMsgVo } from "@workspace/types";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

/**
 * 选择文件
 * @param isMultiple 是否多选
 * @param isDirectory 是否选择目录
 * @param filters 文件过滤器
 * @returns 文件路径列表
 */
export const selectFile = async (
  isMultiple: boolean = false,
  isDirectory: boolean = false,
  filters?: Array<{ name: string; extensions: string[] }>
): Promise<string[] | null> => {
  try {
    const filePath = await open({
      multiple: isMultiple,
      directory: isDirectory,
      filters: filters || [{ name: "All Files", extensions: ["*"] }],
    });

    console.log("Selected file path:", filePath);
    return filePath ? [filePath] : null;
  } catch (error) {
    console.error("File selection failed:", error);
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
    console.error("Convert path to tauri url failed:", error);
    return null;
  }
};

/**
 * 获取文件列表
 * @param bizId 业务ID
 * @param nanoId 可选的消息nano_id，如果提供且raw中有文件名，则优先使用raw中的文件名
 * @returns 文件列表
 */
export const getFiles = async (
  bizId: string,
  nanoId?: string
): Promise<FileVo[] | null> => {
  try {
    let files = [] as FileVo[];
    const FileVos: FileVo[] = await invoke("get_file_by_biz_id", {
      bizId,
      nanoId,
    });

    if (FileVos.length > 0) {
      FileVos.forEach((file) => {
        const tauriFilePath = convertPathToTauriUrl(
          file.absolute_file_path || ""
        );
        if (tauriFilePath) {
          file.tauri_file_path = tauriFilePath;
          files.push(file);
        }
      });
    }
    return files;
  } catch (error: any) {
    console.error("Get files failed:", error);
    return null;
  }
};

/**
 * 获取聊天文件
 * @param bizId 业务ID
 * @param nanoId 可选的消息nano_id，如果提供且raw中有文件名，则优先使用raw中的文件名
 * @returns 文件列表
 */
export const getChatFileByBizId = async (
  bizId: string,
  nanoId?: string
): Promise<FileVo[] | null> => {
  try {
    let files = [] as FileVo[];
    const FileVos: FileVo[] = await invoke("get_chat_file_by_biz_id", {
      bizId,
      nanoId,
    });

    console.log("get_chat_file_by_biz_id result:", FileVos);

    if (FileVos.length > 0) {
      FileVos.forEach((file) => {
        const tauriFilePath = convertPathToTauriUrl(
          file.absolute_file_path || ""
        );
        console.log("File info:", file);
        console.log("Tauri file path:", tauriFilePath);
        if (tauriFilePath) {
          file.tauri_file_path = tauriFilePath;
          files.push(file);
        } else {
          console.error(
            "Failed to convert path to tauri URL:",
            file.absolute_file_path
          );
        }
      });
    }
    console.log("Final files:", files);
    return files;
  } catch (error: any) {
    console.error("Get chat file failed:", error);
    return null;
  }
};

/**
 * 按消息类型获取聊天记录（用于图片预览等场景）
 * @param meUuid 当前用户UUID
 * @param friendUuid 好友UUID
 * @param textType 消息类型（2为图片）
 * @param page 分页参数
 * @returns 聊天记录列表
 */
export const getChatRecordByType = async (
  meUuid: string,
  friendUuid: string,
  textType: number,
  page: Page
): Promise<TextQuicMsgVo[]> => {
  try {
    const textQuicMsg: TextQuicMsgVo = {
      nano_id: "",
      raw: "",
      recv_user: meUuid,
      send_user: friendUuid,
      text_type: 0,
      timestamp: 0,
    };

    const data: TextQuicMsgVo[] = await invoke("get_chat_record_by_type", {
      textQuicMsg,
      textType,
      page,
    });

    return data || [];
  } catch (error: any) {
    console.error("Get chat record by type failed:", error);
    return [];
  }
};

/**
 * 获取好友的所有图片消息并转换为可预览的URL列表
 * @param meUuid 当前用户UUID
 * @param friendUuid 好友UUID
 * @param currentBizId 当前点击的图片bizId
 * @param currentNanoId 可选的当前消息nano_id，用于获取原始文件名
 * @returns 图片URL列表和当前索引
 */
export const getFriendImageMessages = async (
  meUuid: string,
  friendUuid: string,
  currentBizId: string,
  currentNanoId?: string
): Promise<{ imageUrls: string[]; currentIndex: number }> => {
  try {
    const page: Page = { size: 1000, current: 1, total: 0 };
    const records = await getChatRecordByType(meUuid, friendUuid, 2, page);

    const imageUrls: string[] = [];
    let currentIndex = 0;

    for (const record of records) {
      try {
        const imageRecord = JSON.parse(record.raw);
        const bizId = imageRecord.biz_id;

        if (bizId === currentBizId) {
          currentIndex = imageUrls.length;
        }

        // 如果是当前点击的图片，传入nano_id以获取原始文件名
        const nanoId = bizId === currentBizId ? currentNanoId : record.nano_id;
        const files = await getChatFileByBizId(bizId, nanoId);
        if (files && files.length > 0 && files[0].tauri_file_path) {
          imageUrls.push(files[0].tauri_file_path);
        }
      } catch (e) {
        console.error("Failed to parse image record:", e);
      }
    }

    return { imageUrls, currentIndex };
  } catch (error: any) {
    console.error("Get friend image messages failed:", error);
    return { imageUrls: [], currentIndex: 0 };
  }
};

/**
 * 获取群聊的所有图片消息并转换为可预览的URL列表
 * 群聊图片消息 raw 是双层 JSON: {"text":"{...GroupImageRecord...}","send_user":"..."}
 * @param groupUuid 群UUID
 * @param currentBizId 当前点击的图片bizId
 * @param currentNanoId 可选的当前消息nano_id，用于获取原始文件名
 * @returns 图片URL列表和当前索引
 */
export const getGroupImageMessages = async (
  groupUuid: string,
  currentBizId: string,
  currentNanoId?: string
): Promise<{ imageUrls: string[]; currentIndex: number }> => {
  try {
    const page: Page = { size: 1000, current: 1, total: 0 };
    // 群聊记录接口返回所有类型，需要在前端过滤 text_type === 2002
    const allRecords: TextQuicMsgVo[] = await invoke(
      "get_group_chat_record_from_store",
      { groupId: groupUuid, page }
    );

    const imageUrls: string[] = [];
    let currentIndex = 0;

    for (const record of allRecords) {
      if (record.text_type !== 2002) continue;
      try {
        // 群聊图片消息需要双层解析
        let parsed = JSON.parse(record.raw);
        if (parsed.text) {
          parsed = JSON.parse(parsed.text);
        }
        const bizId = parsed.biz_id;
        if (!bizId) continue;

        if (bizId === currentBizId) {
          currentIndex = imageUrls.length;
        }

        const nanoId = bizId === currentBizId ? currentNanoId : record.nano_id;
        const files = await getChatFileByBizId(bizId, nanoId);
        if (files && files.length > 0 && files[0].tauri_file_path) {
          imageUrls.push(files[0].tauri_file_path);
        }
      } catch (e) {
        console.error("Failed to parse group image record:", e);
      }
    }

    return { imageUrls, currentIndex };
  } catch (error: any) {
    console.error("Get group image messages failed:", error);
    return { imageUrls: [], currentIndex: 0 };
  }
};
