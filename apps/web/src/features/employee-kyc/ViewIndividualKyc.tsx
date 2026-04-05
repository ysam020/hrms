import React, { useContext } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BasicInfo from "@web/features/profile/BasicInfo";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { UserContext } from "@web/app/providers/UserContext";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";

function ViewIndividualKyc() {
  const { username } = useParams();
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const { setAlert } = useContext(AlertContext);

  // Fetch user data using custom hook
  const { data, loading } = useFetchData(
    `/get-user-data/${username}`,
    "get",
    [username],
    null,
    null,
  );

  const handleKycApproval = async (status) => {
    const kyc_approval = status === true ? "Approved" : "Rejected";

    try {
      const res = await apiClient.post(API_ENDPOINTS.KYC_APPROVAL, {
        username,
        kyc_approval,
      });
      setAlert({
        open: true,
        message: res.data.message,
        severity: "success",
      });
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : error.response.data.message,
        severity: "error",
      });
    }
  };

  return (
    <>
      {!loading && data && (
        <div style={{ padding: 20 }}>
          <ErrorBoundary fallback={<ErrorFallback />}>
            <BasicInfo user={data} />

            {data?.employeeStatus === "Active" && (
              <>
                <br />
                <div className="flex-div">
                  {(user?.isSuperUser || user.username !== username) && (
                    <>
                      <Button onClick={() => handleKycApproval(true)}>
                        Approve
                      </Button>
                      <Button
                        style={{ marginLeft: "10px" }}
                        onClick={() => handleKycApproval(false)}
                      >
                        Reject
                      </Button>
                    </>
                  )}

                  {(user.username !== username || user.isSuperUser) && (
                    <Button
                      style={{ marginLeft: "10px" }}
                      onClick={() => navigate(`/edit-kyc/${data.username}`)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </>
            )}
          </ErrorBoundary>
        </div>
      )}
    </>
  );
}

export default React.memo(ViewIndividualKyc);
