/**
 * Grid helpers shared by the stages. The world grid is n × n voxel columns, indexed k = z * n + x.
 */

export const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
