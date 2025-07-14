import React from "react";
import { useParams } from "react-router-dom";
import CompleteKYC from "./CompleteKYC";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";

function EditEmployeeKyc() {
  const { username } = useParams();

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <CompleteKYC username={username} edit={true} />
    </ErrorBoundary>
  );
}

export default React.memo(EditEmployeeKyc);
