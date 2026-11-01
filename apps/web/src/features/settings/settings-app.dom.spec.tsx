import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, newDb, renderWithQuery } from "@/test/fake-api";
import { SettingsApp } from "./settings-app";

describe("SettingsApp time zone", () => {
  it("shows the saved zone and saves a new one", async () => {
    const db = newDb({ timeZone: "Asia/Manila" });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<SettingsApp />);

    const select = await screen.findByRole("combobox", { name: "Time zone" });
    await waitFor(() => expect(select).toHaveValue("Asia/Manila"));
    await user.selectOptions(select, "Asia/Tokyo");
    await waitFor(() =>
      expect(db.writes[0]).toMatchObject({
        method: "PATCH",
        path: "/api/settings",
        body: { timeZone: "Asia/Tokyo" },
      }),
    );
  });

  it("explains that the browser's zone is used until one is chosen", async () => {
    installFakeApi(newDb({ timeZone: null }));
    renderWithQuery(<SettingsApp />);
    expect(await screen.findByText(/browser’s zone is used/)).toBeInTheDocument();
  });

  it("shows the account and theme choices", async () => {
    installFakeApi(newDb());
    renderWithQuery(<SettingsApp />);
    expect(await screen.findByText("@hana")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sakura Latte/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Midnight Blossom/ })).toBeInTheDocument();
  });
});
