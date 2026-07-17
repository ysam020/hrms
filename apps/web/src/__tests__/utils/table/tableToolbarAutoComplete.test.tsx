import { render, screen } from "@testing-library/react";
import { tableToolbarAutoComplete } from "@web/shared/utils/table/tableToolbarAutoComplete";

describe("tableToolbarAutoComplete", () => {
  it("returns a renderTopToolbarCustomActions render-prop", () => {
    const config = tableToolbarAutoComplete("", vi.fn(), vi.fn(), [], vi.fn());
    expect(config.renderTopToolbarCustomActions).toEqual(expect.any(Function));
  });

  it("renders an AutoComplete input seeded with the typed value", () => {
    const config = tableToolbarAutoComplete(
      "Jane",
      vi.fn(),
      vi.fn(),
      [],
      vi.fn(),
    );
    render(<>{config.renderTopToolbarCustomActions()}</>);
    const input = screen.getByPlaceholderText(
      "Select User",
    ) as HTMLInputElement;
    expect(input.value).toBe("Jane");
  });

  it("wires onChange to setTypedUser and completeMethod to searchUser", () => {
    const setTypedUser = vi.fn();
    const searchUser = vi.fn();
    const config = tableToolbarAutoComplete(
      "",
      setTypedUser,
      vi.fn(),
      [],
      searchUser,
    );
    const element = config.renderTopToolbarCustomActions() as any;

    element.props.onChange({ value: "Ja" });
    element.props.completeMethod({ query: "Ja" });

    expect(setTypedUser).toHaveBeenCalledWith("Ja");
    expect(searchUser).toHaveBeenCalledWith("Ja");
  });

  // Note: PrimeReact's suggestion-overlay selection (mouse click / keyboard
  // nav+Enter on a suggestion item) depends on its own internal positioning
  // and portal rendering, which isn't reliably exercisable under jsdom.
  // What's ours to verify is that onSelect is wired to both setters — done
  // by directly invoking the AutoComplete's onSelect prop below rather than
  // simulating the full overlay interaction.
  it("wires onSelect to call both setTypedUser and setSelectedUser with the chosen value", () => {
    const setTypedUser = vi.fn();
    const setSelectedUser = vi.fn();
    const config = tableToolbarAutoComplete(
      "",
      setTypedUser,
      setSelectedUser,
      ["Jane Doe", "Jane Smith"],
      vi.fn(),
    );
    const element = config.renderTopToolbarCustomActions() as any;

    element.props.onSelect({ value: "Jane Doe" });

    expect(setTypedUser).toHaveBeenCalledWith("Jane Doe");
    expect(setSelectedUser).toHaveBeenCalledWith("Jane Doe");
  });
});
