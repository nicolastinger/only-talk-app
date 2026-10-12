import { showDialog, showToast } from "vant";
import { add_friend, switch_plaza_crush } from "@workspace/services";
import { getMyUuid, parseResponse } from "@/utils/api";
import { t } from "@/i18n";
import type {
  FriendRequestInfoDTO,
  PlazaCrushResult,
  PlazaUser,
} from "@workspace/types";

export const genderText = (gender?: number) => {
  if (gender === undefined || gender === null) return "";
  const map: Record<number, string> = {
    0: t("userInfo.genderTypes.unknown"),
    1: t("userInfo.genderTypes.secret"),
    2: t("userInfo.genderTypes.male"),
    3: t("userInfo.genderTypes.female"),
    4: t("userInfo.genderTypes.robot"),
    5: t("userInfo.genderTypes.other"),
  };
  return map[gender] ?? map[0];
};

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
    title: t("plaza.matchTitle"),
    message: t("plaza.matchMessage", { name: userName }),
    confirmButtonText: t("plaza.addFriend"),
    confirmButtonColor: "#ff6b81",
    cancelButtonText: t("plaza.continue"),
  })
    .then(() => true)
    .catch(() => false);

const mapAddFriendError = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("Already added as friend"))
    return t("friendRequest.alreadyFriend");
  if (msg.includes("Please do not add repeatedly"))
    return t("friendRequest.duplicateRequest");
  if (msg.includes("request") || msg.includes("发送"))
    return t("friendRequest.sendFailed");
  return msg || t("friendRequest.sendFailed");
};

/** 从广场发送好友申请，成功返回 true */
export const sendPlazaFriendRequest = async (
  targetUuid: string,
  addType = "plaza"
): Promise<boolean> => {
  try {
    const me = await getMyUuid();
    const dto: FriendRequestInfoDTO = {
      request_message: t("plaza.helloMessage"),
      accept_message: "",
      request_user: me,
      accept_user: targetUuid,
      add_type: addType,
      version: 0,
      accept_status: 0,
    };
    parseResponse(await add_friend(dto, { autoShowError: false }));
    showToast({ message: t("plaza.requestSent"), icon: "success" });
    return true;
  } catch (e) {
    showToast(mapAddFriendError(e));
    return false;
  }
};
