const GENDER_IDS: Record<number, string> = {
  0: 'userInfo.genderTypes.unknown',
  1: 'userInfo.genderTypes.secret',
  2: 'userInfo.genderTypes.male',
  3: 'userInfo.genderTypes.female',
  4: 'userInfo.genderTypes.robot',
  5: 'userInfo.genderTypes.other',
};

export const getGenderLabel = (
  intl: { formatMessage: (d: { id: string }) => string },
  gender?: number,
): string => {
  if (gender === undefined || gender === null) return '';
  const id = GENDER_IDS[gender] ?? GENDER_IDS[0];
  return intl.formatMessage({ id });
};
