import { render, screen, waitFor } from "@testing-library/react";
import SafeApexChart from "@web/shared/components/SafeApexChart";

vi.mock("react-apexcharts", () => ({
  default: (props: any) => (
    <div data-testid="chart">{JSON.stringify(props.series)}</div>
  ),
}));

describe("SafeApexChart", () => {
  it("shows a loading placeholder before the chart mounts", () => {
    render(<SafeApexChart series={[]} height={200} />);
    expect(screen.getByText("Loading chart...")).toBeInTheDocument();
  });

  it("renders the chart after the initial delay", async () => {
    render(<SafeApexChart series={[{ name: "A", data: [1, 2, 3] }]} />);
    expect(await screen.findByTestId("chart")).toBeInTheDocument();
  });

  it("replaces null/undefined series entries with an empty named series", async () => {
    render(<SafeApexChart series={[null, undefined]} />);
    const chart = await screen.findByTestId("chart");
    expect(JSON.parse(chart.textContent!)).toEqual([
      { name: "", data: [] },
      { name: "", data: [] },
    ]);
  });

  it("clamps non-finite numeric series values to 0", async () => {
    render(<SafeApexChart series={[Infinity, NaN, 5]} />);
    const chart = await screen.findByTestId("chart");
    expect(JSON.parse(chart.textContent!)).toEqual([0, 0, 5]);
  });

  it("filters out null/undefined points and clamps non-finite numbers within a series' data array", async () => {
    render(
      <SafeApexChart
        series={[{ name: "A", data: [1, null, undefined, Infinity, NaN, 5] }]}
      />,
    );
    const chart = await screen.findByTestId("chart");
    expect(JSON.parse(chart.textContent!)).toEqual([
      { name: "A", data: [1, 0, 0, 5] },
    ]);
  });

  it("sanitizes a non-finite y value inside an object data point", async () => {
    render(
      <SafeApexChart
        series={[
          {
            name: "A",
            data: [
              { x: "Mon", y: Infinity },
              { x: "Tue", y: 10 },
            ],
          },
        ]}
      />,
    );
    const chart = await screen.findByTestId("chart");
    expect(JSON.parse(chart.textContent!)).toEqual([
      {
        name: "A",
        data: [
          { x: "Mon", y: 0 },
          { x: "Tue", y: 10 },
        ],
      },
    ]);
  });

  it("passes through a non-array series value unchanged", async () => {
    render(<SafeApexChart series={"not-an-array" as any} />);
    const chart = await screen.findByTestId("chart");
    expect(JSON.parse(chart.textContent!)).toBe("not-an-array");
  });
});
