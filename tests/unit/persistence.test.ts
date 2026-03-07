 

import { initDb, db, _test_resetDbInstance } from "@/lib/persistence";
import type { UnitOfWork } from "@/lib/persistence/repositories";

describe("persistence initDb", () => {
  afterEach(() => {
    // avoid contaminating other tests
    _test_resetDbInstance();
  });

  it("allows a fake UnitOfWork to be injected and used via the proxy", async () => {
    const fake: Partial<UnitOfWork> = {
      users: {
        findByEmail: jest.fn().mockResolvedValue({ id: "fake" }),
      } as any,
    };

    await initDb(fake as UnitOfWork);

    const result = await db.users.findByEmail("x@example.com");
    expect(result).toEqual({ id: "fake" });
    expect((fake.users as any).findByEmail).toHaveBeenCalledWith("x@example.com");
  });

  it("initializes new instance when none existed", async () => {
    expect(_test_resetDbInstance).toBeDefined();
    // reset ensures we are starting from null
    _test_resetDbInstance();
    // after resetting, calling db should re-create real instance
    const userRepo = db.users;
    expect(userRepo).toBeDefined();
  });
});
