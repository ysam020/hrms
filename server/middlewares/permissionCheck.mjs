function checkPermission(module, action) {
  return (req, res, next) => {
    const user = req.user;

    if (user?.isSuperUser) {
      // Super users bypass permission checks
      req.permissionScope = "all";
      return next();
    }

    if (!user?.permissions || !Array.isArray(user.permissions)) {
      return res.status(403).json({ message: "No permissions assigned" });
    }

    let resolvedAction;
    try {
      resolvedAction = typeof action === "function" ? action(req) : action;
    } catch (err) {
      console.error(err);
      return res
        .status(400)
        .json({ message: "Invalid permission check logic" });
    }

    const matches = user.permissions
      .map((perm) => {
        const [mod, act, scope] = perm.split(":");
        return { mod, act, scope };
      })
      .filter((perm) => perm.mod === module && perm.act === resolvedAction);

    if (matches.length === 0) {
      return res
        .status(403)
        .json({ message: "You don't have necessary permission" });
    }

    const scopePriority = ["all", "team", "self"];
    matches.sort(
      (a, b) => scopePriority.indexOf(a.scope) - scopePriority.indexOf(b.scope)
    );

    req.permissionScope = matches[0].scope;
    next();
  };
}

export default checkPermission;
