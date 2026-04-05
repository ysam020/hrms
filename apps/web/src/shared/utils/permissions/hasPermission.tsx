import {
  fromPermissionsArray,
  hasPermissionFromMask,
} from "./PermissionBitmask";

const _maskCache = new WeakMap();

function getMask(permissions) {
  if (!_maskCache.has(permissions)) {
    _maskCache.set(permissions, fromPermissionsArray(permissions));
  }
  return _maskCache.get(permissions);
}

/**
 * Check whether a permissions array contains a specific module:action:scope.
 *
 * Exact-match semantics (no scope hierarchy expansion) so checkbox states in
 * the permissions editor remain independent per scope.
 *
 * @param {string}   module
 * @param {string}   action
 * @param {string}   scope      - use "-" for scopeless permissions
 * @param {boolean}  isSuperUser
 * @param {string[]} permissions
 * @returns {boolean}
 */
const hasPermission = (module, action, scope, isSuperUser, permissions) => {
  if (isSuperUser) return true;

  if (!Array.isArray(permissions) || permissions.length === 0) return false;

  return hasPermissionFromMask(getMask(permissions), module, action, scope);
};

export default hasPermission;
