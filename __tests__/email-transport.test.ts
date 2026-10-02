import { sendEmail } from "@/lib/email";

describe("email transport", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; jest.restoreAllMocks(); });

  it("sends through Resend when a key is set", async () => {
    process.env.RESEND_API_KEY = "re_test";
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;

    await sendEmail("learner@example.com", "Verify your email", "<p>Hi</p>");

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test" });
    expect(JSON.parse(init.body)).toMatchObject({ to: ["learner@example.com"], subject: "Verify your email", html: "<p>Hi</p>" });
  });

  it("surfaces a Resend failure instead of pretending the email went out", async () => {
    process.env.RESEND_API_KEY = "re_test";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "domain not verified" }) as jest.Mock;
    await expect(sendEmail("a@example.com", "s", "<p/>")).rejects.toThrow(/Resend send failed \(403\)/);
  });

  it("only logs the links in local development, and sends nothing", async () => {
    delete process.env.RESEND_API_KEY;
    global.fetch = jest.fn() as jest.Mock;
    const log = jest.spyOn(console, "info").mockImplementation(() => undefined);
    await sendEmail("a@example.com", "Verify", '<a href="http://localhost:3000/api/verify?token=t">go</a>');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain("http://localhost:3000/api/verify?token=t");
  });
});
