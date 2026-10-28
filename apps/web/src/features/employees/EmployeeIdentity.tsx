import type { CSSProperties } from "react";
import { Avatar, Status } from "@next/ui";
import { personName } from "@next/lib/format";
import s from "./employees.module.css";

/** The block that morphs between the list row and the detail header. */
export function EmployeeIdentity({
  person,
  style,
  size = 64,
}: {
  person: any;
  style?: CSSProperties;
  size?: number;
}) {
  return (
    <div className={s.identity} style={style}>
      <Avatar
        name={personName(person)}
        src={person?.employee_photo}
        size={size}
      />
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <span className={s.identityName}>{personName(person)}</span>
        <span className={s.identityRole}>
          {[person?.designation, person?.department]
            .filter(Boolean)
            .join(" · ") || person?.username}
        </span>
        {person?.employeeStatus && (
          <span>
            <Status value={person.employeeStatus} />
          </span>
        )}
      </div>
    </div>
  );
}
