import apiClient from "../../config/axiosConfig";
import protobuf from "protobufjs";

export const requestNewCodes = async (user, setUser) => {
  try {
    try {
      const root = await protobuf.load("/user.proto");
      const BackupCodesResponse = root.lookupType(
        "userpackage.BackupCodesResponse"
      );

      // Make request
      const response = await apiClient("/request-new-backup-codes", {
        headers: {
          Accept: "application/x-protobuf",
        },
        responseType: "arraybuffer",
      });

      // Decode the protobuf response
      const message = BackupCodesResponse.decode(new Uint8Array(response.data));

      // Convert to plain object
      const data = BackupCodesResponse.toObject(message, {
        longs: String,
        enums: String,
        defaults: true,
        arrays: true,
      });

      setUser({ ...user, backupCodes: data.backupCodes });
    } catch (error) {
      console.error("Error requesting backup codes:", error);
      return {
        success: false,
        error: "Failed to generate backup codes",
      };
    }
  } catch (error) {
    console.error("Error occurred while requesting new backup codes:", error);
  }
};
