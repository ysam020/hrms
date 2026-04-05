export { getUser } from "./getUser";
export { updateUser } from "./updateUser";
export { listUsers } from "./listUsers";
export { deleteUser } from "./deleteUser";
export { registerFcmToken } from "./registerFcmToken";
export { removeFcmToken } from "./removeFcmToken";
export { cleanupExpiredFcmTokens } from "./cleanupExpiredFcmTokens";

// Map to proto service method names
import { getUser } from "./getUser";
import { updateUser } from "./updateUser";
import { listUsers } from "./listUsers";
import { deleteUser } from "./deleteUser";
import { registerFcmToken } from "./registerFcmToken";
import { removeFcmToken } from "./removeFcmToken";
import { cleanupExpiredFcmTokens } from "./cleanupExpiredFcmTokens";

export const handlers = {
  GetUser: getUser,
  UpdateUser: updateUser,
  ListUsers: listUsers,
  DeleteUser: deleteUser,
  RegisterFcmToken: registerFcmToken,
  RemoveFcmToken: removeFcmToken,
  CleanupExpiredFcmTokens: cleanupExpiredFcmTokens,
};
