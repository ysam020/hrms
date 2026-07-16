import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import PaymentsIcon from "@mui/icons-material/Payments";
import MapIcon from "@mui/icons-material/Map";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { isOwnerOrAdmin } from "@web/shared/utils/permissions/navAccess";
import { API_ENDPOINTS } from "@web/shared/constants";
import { SalaryComponentsTab } from "./SalaryComponentsTab";
import { PtSlabsTab } from "./PtSlabsTab";
import { PayCyclesTab } from "./PayCyclesTab";
import { IncomeTaxSlabsTab } from "./IncomeTaxSlabsTab";
import type { IncomeTaxSlab, PayCycle, PtSlab, SalaryComponent } from "./types";

export default function PayrollComponentsSettings() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const canEdit =
    isOwnerOrAdmin(user) ||
    user?.permissions?.includes("Organisation:edit_organisation_settings");

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [slabs, setSlabs] = useState<PtSlab[]>([]);
  const [cycles, setCycles] = useState<PayCycle[]>([]);
  const [taxSlabs, setTaxSlabs] = useState<IncomeTaxSlab[]>([]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [componentsRes, slabsRes, cyclesRes, taxSlabsRes] =
        await Promise.all([
          apiClient.get(API_ENDPOINTS.LIST_SALARY_COMPONENTS),
          apiClient.get(API_ENDPOINTS.LIST_PT_SLABS),
          apiClient.get(API_ENDPOINTS.LIST_PAY_CYCLES),
          apiClient.get(API_ENDPOINTS.LIST_TDS_SLABS),
        ]);
      setComponents(componentsRes.data?.data ?? []);
      setSlabs(slabsRes.data?.data ?? []);
      setCycles(cyclesRes.data?.data ?? []);
      setTaxSlabs(taxSlabsRes.data?.data ?? []);
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to load payroll components.",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 640 }}
        >
          Basic, HRA, Conveyance, PF, ESI, and PT are pre-configured below with
          the standard rates (PF 12% of basic, ESI 1.75% of gross, PT ₹200) —
          edit them to change how every payslip is calculated. State-wise
          Professional Tax slabs override the flat PT rate once configured.
          Additional custom components can be added here, but aren't applied to
          payroll calculations yet.
        </Typography>
      </Box>

      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have read-only access. Contact an owner or admin to make changes.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: "divider", px: 1 }}
        >
          <Tab
            icon={<PaymentsIcon fontSize="small" />}
            iconPosition="start"
            label={`Components (${components.length})`}
          />
          <Tab
            icon={<MapIcon fontSize="small" />}
            iconPosition="start"
            label={`PT Slabs (${slabs.length})`}
          />
          <Tab
            icon={<EventRepeatIcon fontSize="small" />}
            iconPosition="start"
            label={`Pay Cycles (${cycles.length})`}
          />
          <Tab
            icon={<PaymentsIcon fontSize="small" />}
            iconPosition="start"
            label={`Income Tax Slabs (${taxSlabs.length})`}
          />
        </Tabs>

        {tab === 0 && (
          <SalaryComponentsTab
            components={components}
            canEdit={!!canEdit}
            onRefetch={fetchAll}
            setAlert={setAlert}
          />
        )}
        {tab === 1 && (
          <PtSlabsTab
            slabs={slabs}
            canEdit={!!canEdit}
            onRefetch={fetchAll}
            setAlert={setAlert}
          />
        )}
        {tab === 2 && (
          <PayCyclesTab
            cycles={cycles}
            canEdit={!!canEdit}
            onRefetch={fetchAll}
            setAlert={setAlert}
          />
        )}
        {tab === 3 && (
          <IncomeTaxSlabsTab
            taxSlabs={taxSlabs}
            canEdit={!!canEdit}
            onRefetch={fetchAll}
            setAlert={setAlert}
          />
        )}
      </Paper>
    </Box>
  );
}
