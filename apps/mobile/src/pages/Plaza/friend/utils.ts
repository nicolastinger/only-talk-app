import { showDialog, showToast } from "vant";
import { add_friend, switch_plaza_crush } from "@workspace/services";
import { getMyUuid, parseResponse } from "@/utils/api";
import type {
  FriendRequestInfoDTO,
  PlazaCrushResult,
  PlazaUser,
} from "@workspace/types";

export const GENDER_TEXT: Record<number, string> = {
  0: "未知",
  1: "保密",
  2: "男",
  3: "女",
  4: "机器人",
  5: "其他",
};

export const genderText = (gender?: number) =>
  gender === undefined || gender === null
    ? ""
    : GENDER_TEXT[gender] ?? GENDER_TEXT[0];

export const isMale = (gender?: number) => gender === 2;
export const isFemale = (gender?: number) => gender === 3;

/** 切换心动，返回是否匹配 */
export const toggleCrush = async (
  user: PlazaUser
): Promise<PlazaCrushResult> => {
  const res = await switch_plaza_crush({ target_uuid: user.uuid });
  user.liked_by_me = !user.liked_by_me;
  return res;
};

/** 匹配成功弹窗，返回是否加好友 */
export const confirmMatch = (userName: string): Promise<boolean> =>
  showDialog({
    title: "互相心动啦！",
    message: `你和「${userName}」互相心动了，要加个好友进一步了解吗？`,
    confirmButtonText: "加好友",
    confirmButtonColor: "#ff6b81",
    cancelButtonText: "继续浏览",
  })
    .then(() => true)
    .catch(() => false);

const mapAddFriendError = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("Already added as friend")) return "你们已经是好友了";
  if (msg.includes("Please do not add repeatedly"))
    return "请勿重复申请，等待对方处理";
  if (msg.includes("request") || msg.includes("发送"))
    return "发送失败，请稍后重试";
  return msg || "发送失败，请稍后重试";
};

/** 从广场发送好友申请，成功返回 true */
export const sendPlazaFriendRequest = async (
  targetUuid: string,
  addType = "plaza"
): Promise<boolean> => {
  try {
    const me = await getMyUuid();
    const dto: FriendRequestInfoDTO = {
      request_message: "你好，很高兴认识你！",
      accept_message: "",
      request_user: me,
      accept_user: targetUuid,
      add_type: addType,
      version: 0,
      accept_status: 0,
    };
    parseResponse(await add_friend(dto));
    showToast({ message: "好友申请已发送", icon: "success" });
    return true;
  } catch (e) {
    showToast(mapAddFriendError(e));
    return false;
  }
};
