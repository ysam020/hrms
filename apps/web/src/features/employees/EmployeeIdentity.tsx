import { sharedPart } from "@next/motion";
import { Avatar, Status } from "@next/ui";
import {
  personName,
  readableCase,
  type PersonNameFields,
} from "@next/lib/format";
import s from "./employees.module.css";

/** What a list row hands over to the profile (motion/handOff). */
export interface PersonSummary extends PersonNameFields {
  username: string;
  employee_photo?: string | null;
  designation?: string;
  department?: string;
}

/**
 * A person's avatar, name and role. With `sharedKey` (the username the
 * profile route is keyed by), the avatar and the name are shared elements:
 * they grow out of the row that opened the profile.
 */
export function EmployeeIdentity({
  person,
  sharedKey,
  size = 64,
}: {
  person: any;
  sharedKey?: string;
  size?: number;
}) {
  const shared = Boolean(sharedKey);
  return (
    <div className={s.identity}>
      <Avatar
        name={personName(person)}
        src={person?.employee_photo}
        size={size}
        style={sharedPart("person", sharedKey ?? "", "avatar", shared)}
      />
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <span
          className={s.identityName}
          style={sharedPart("person", sharedKey ?? "", "title", shared)}
        >
          {readableCase(personName(person))}
        </span>
        <span className={s.identityRole}>
          {[readableCase(person?.designation), readableCase(person?.department)]
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
