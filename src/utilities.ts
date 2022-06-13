export const arrayContains = <T>(itemList: T[], item: T): boolean => {
  return itemList.findIndex((i) => i === item) !== -1;
};
