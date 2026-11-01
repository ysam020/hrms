async (page) => {
  const ctx = page.context();
  const perf = ctx.__perf;
  const cfg = ctx.__nav || { pass: 1, start: 0, n: 20 };
  const pass = cfg.pass;
  ctx.__rt = ctx.__rt || [];
  await page.evaluate(() => {
    performance.setResourceTimingBufferSize(10000);
    performance.clearResourceTimings();
  });
  const routes = [
    ["Dashboard", "/dashboard"],
    ["Approvals", "/approvals"],
    ["Calendar", "/calendar"],
    ["Chat", "/chat"],
    ["Profile", "/profile"],
    ["Employees", "/employee-management/employee-list"],
    ["Employees", "/employee-management/insights"],
    ["Organization", "/organization-tree"],
    ["Attendance", "/attendance"],
    ["Attendance", "/attendance/view-all-attendances"],
    ["Attendance", "/attendance/attendance-correction"],
    ["Attendance", "/attendance/insights"],
    ["Leave", "/attendance/view-leave-applications"],
    ["Leave", "/attendance/apply-leave"],
    ["WFH", "/wfh/requests"],
    ["Holidays", "/holidays"],
    ["KYC", "/kyc/view-employee-kycs"],
    ["KYC", "/kyc/complete-kyc"],
    ["KYC", "/kyc/insights"],
    ["Recruitment", "/job-openings/view-job-openings"],
    ["Recruitment", "/job-openings/insights"],
    ["Performance", "/performance-reviews/reviews"],
    ["Performance", "/performance-reviews/review-cycles"],
    ["Payroll", "/payroll/my-payslips"],
    ["Payroll", "/payroll/salary-advances"],
    ["Payroll", "/payroll/my-tax-declaration"],
    ["Payroll", "/payroll/payroll-runs"],
    ["Payroll", "/payroll/salary-management"],
    ["Payroll", "/payroll/tax-declarations"],
    ["Assets", "/assets/inventory"],
    ["Assets", "/assets/issues"],
    ["Assets", "/assets/summary"],
    ["Resignations", "/resignation-process/view-resignations"],
    ["Resignations", "/resignation-process/exit-feedback"],
    ["Resignations", "/resignation-process/insights"],
    ["Announcements", "/hr-activities"],
    ["Policies", "/policy"],
    ["Helpdesk", "/helpdesk"],
    ["Analytics", "/analytics/workforce"],
    ["Analytics", "/analytics/leave-attendance"],
    ["Analytics", "/analytics/recruitment"],
    ["Analytics", "/analytics/salary"],
    ["Reports", "/reports/report-builder"],
    ["Reports", "/reports/saved-reports"],
    ["Permissions", "/permissions/manage-roles"],
    ["Permissions", "/permissions/user-permissions"],
    ["Permissions", "/permissions/teams"],
    ["Settings", "/settings/company"],
    ["Settings", "/settings/leave"],
    ["Settings", "/settings/attendance"],
    ["Settings", "/settings/hr-policy"],
    ["Settings", "/settings/work-week"],
    ["Settings", "/settings/exit-policy"],
    ["Settings", "/settings/payroll"],
    ["Settings", "/settings/recruitment-pipeline"],
    ["Settings", "/settings/join-requests"],
    ["Subscription", "/subscription"],
    ["Help", "/help"],
    ["Help", "/help/tours"],
    ["Support", "/support"],
    ["Support", "/platform/support"],
    ["AI Assistants", "/ai-assistants"],
    ["Audit Logs", "/audit-logs"],
  ];
  const idle = async (quiet = 1200, max = 20000) => {
    const t0 = Date.now();
    let last = Date.now(),
      lastCount = -1;
    while (Date.now() - t0 < max) {
      await page.waitForTimeout(150);
      const n = perf.pending.size + perf.rows.length;
      if (n !== lastCount || perf.pending.size > 0) {
        lastCount = n;
        if (perf.pending.size > 0 || n !== lastCount) last = Date.now();
        if (perf.pending.size > 0) last = Date.now();
      }
      if (perf.pending.size === 0 && Date.now() - last > quiet)
        return Date.now() - t0;
    }
    return "timeout";
  };
  const out = [];
  for (const [module, path] of routes.slice(cfg.start, cfg.start + cfg.n)) {
    const before = perf.rows.length;
    perf.label = { module, page: path, pass };
    await page.evaluate((p) => {
      history.pushState({}, "", p);
      dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    }, path);
    const w = await idle();
    const rt = await page.evaluate(() => {
      const e = performance
        .getEntriesByType("resource")
        .filter((x) => x.name.includes("/api/v1/"))
        .map((x) => ({
          name: x.name,
          start: x.startTime,
          dur: x.duration,
          ttfb: x.responseStart - x.requestStart,
          dl: x.responseEnd - x.responseStart,
          enc: x.encodedBodySize,
          dec: x.decodedBodySize,
          xfer: x.transferSize,
          proto: x.nextHopProtocol,
          init: x.initiatorType,
        }));
      performance.clearResourceTimings();
      return e;
    });
    rt.forEach((e) => {
      e.module = module;
      e.page = path;
      e.pass = pass;
      ctx.__rt.push(e);
    });
    out.push(
      `${path} -> ${page.url().replace("https://localhost", "")} reqs=${perf.rows.length - before} wait=${w}`,
    );
  }
  perf.label = { module: "idle", page: "idle", pass };
  ctx.__nav = { ...cfg, start: cfg.start + cfg.n };
  return out.join("\n");
};
