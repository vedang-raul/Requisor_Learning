import { parseSender, sendEmail } from "@/lib/email";

describe("email transport", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; jest.restoreAllMocks(); });

  it("sends through Brevo when its key is set, in preference to Resend", async () => {
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.RESEND_API_KEY = "re_test";
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;

    await sendEmail("learner@example.com", "Verify your email", "<p>Hi</p>");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers).toMatchObject({ "api-key": "xkeysib-test" });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ to: [{ email: "learner@example.com" }], subject: "Verify your email", htmlContent: "<p>Hi</p>" });
    expect(body.sender.email).toMatch(/@/);
  });

  it("surfaces a Brevo failure instead of pretending the email went out", async () => {
    process.env.BREVO_API_KEY = "xkeysib-test";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Key not found" }) as jest.Mock;
    await expect(sendEmail("a@example.com", "s", "<p/>")).rejects.toThrow(/Brevo send failed \(401\)/);
  });

  it("reads the sender's name and address from EMAIL_FROM", () => {
    expect(parseSender("Requisor Learning <support@requisor.io>")).toEqual({ name: "Requisor Learning", email: "support@requisor.io" });
    expect(parseSender('"Alma by Requisor" <hello@requisor.io>')).toEqual({ name: "Alma by Requisor", email: "hello@requisor.io" });
    expect(parseSender(" support@requisor.io ")).toEqual({ email: "support@requisor.io" });
  });

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
    delete process.env.BREVO_API_KEY;
    global.fetch = jest.fn() as jest.Mock;
    const log = jest.spyOn(console, "info").mockImplementation(() => undefined);
    await sendEmail("a@example.com", "Verify", '<a href="http://localhost:3000/api/verify?token=t">go</a>');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain("http://localhost:3000/api/verify?token=t");
  });
});
