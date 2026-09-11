/** 举报目标类型: 1=用户, 2=群组, 3=动态, 4=卡片匹配(交友广场用户), 5=动态评论 */
export const ReportTargetType = {
  USER: 1,
  GROUP: 2,
  MOMENT: 3,
  PLAZA_USER: 4,
  MOMENT_COMMENT: 5,
} as const;

export type ReportTargetTypeValue =
  (typeof ReportTargetType)[keyof typeof ReportTargetType];

/** 提交举报 DTO */
export interface CreateReportDTO {
  /** 举报目标类型 */
  target_type: ReportTargetTypeValue;
  /** 举报目标主键 (用户/群/动态/广场用户 uuid 或 评论 id) */
  target_uuid: string;
  /** 举报原因/描述 */
  reason: string;
}
