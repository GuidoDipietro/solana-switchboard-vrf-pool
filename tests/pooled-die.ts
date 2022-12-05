import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { PooledDie } from "../target/types/pooled_die";
import { PooledDieSDK } from "./pooledDieSdk";
import { assert } from "chai";
import { sleep } from "@switchboard-xyz/sbv2-utils";

describe("pooled-die", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PooledDie as Program<PooledDie>;

  const admin = provider.wallet as NodeWallet;
  const USERS = 4;
  const users = [...Array(USERS)].map((u) => anchor.web3.Keypair.generate());

  let adminSDK = new PooledDieSDK(program);
  let user0SDK = new PooledDieSDK(program, new anchor.Wallet(users[0]));
  let user1SDK = new PooledDieSDK(program, new anchor.Wallet(users[1]));
  let user2SDK = new PooledDieSDK(program, new anchor.Wallet(users[2]));
  let user3SDK = new PooledDieSDK(program, new anchor.Wallet(users[3]));

  before(async () => {
    // Create Switchboard test environment and wait for oracle hearbeat
    await adminSDK.createSwitchboardTestContext();
    await user0SDK.createSwitchboardTestContext();
    await user1SDK.createSwitchboardTestContext();
    await user2SDK.createSwitchboardTestContext();
    await user3SDK.createSwitchboardTestContext();

    // Initialize
    await adminSDK.initialize();

    // Enlarge pool to have 3 VrfAccounts
    await adminSDK.enlargePool(3);
  });

  it("Created the VrfAccount pool correctly", async () => {
    let vrfAccountList = (await program.account.vrfAccountList.all())[0]
      .account;
    let globalState = (await program.account.globalState.all())[0].account;

    assert.equal(vrfAccountList.list.length, 3);
    for (let i = 0; i < vrfAccountList.list.length; i++) {
      assert.isNotNull(vrfAccountList.list[i]);
    }
    assert.equal(globalState.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(globalState.vrfAccountPointer, 0);
    assert.equal(globalState.vrfPoolSize, vrfAccountList.list.length);
    assert.equal(
      globalState.switchboardStateBump,
      adminSDK.getSwitchboardStateBump()
    );
  });

  it("Creates a dice for 3 users", async () => {
    await user0SDK.createDice();
    await user1SDK.createDice();
    await user2SDK.createDice();
  });

  it("Users can claim their rolled dice", async () => {
    await sleep(10000);

    let results = [
      await user0SDK.claimDice(),
      await user1SDK.claimDice(),
      await user2SDK.claimDice(),
    ];

    console.log(results);
  });

  it("Fails to create more die than manageable by pool size", async () => {
    await user0SDK.createDice();
    await user1SDK.createDice();
    await user2SDK.createDice();
    try {
      await user3SDK.createDice();
    } catch (error) {
      assert.equal(
        error.error.errorCode.code,
        "VrfRequestAlreadyLaunchedError"
      );
    }

    // Claim die to be able to test again
    await sleep(10000);
    await user0SDK.claimDice();
    await user1SDK.claimDice();
    await user2SDK.claimDice();
  });

  it("Can enlarge Vrf pool and now more calls succeed", async () => {
    await adminSDK.enlargePool(1);

    // Check enlarged correctly
    let vrfAccountList = (await program.account.vrfAccountList.all())[0]
      .account;
    let globalState = (await program.account.globalState.all())[0].account;

    assert.equal(vrfAccountList.list.length, 4);
    for (let i = 0; i < vrfAccountList.list.length; i++) {
      assert.isNotNull(vrfAccountList.list[i]);
    }
    assert.equal(globalState.vrfAccountPointer, 0);
    assert.equal(globalState.vrfPoolSize, vrfAccountList.list.length);

    await user0SDK.createDice();
    await user1SDK.createDice();
    await user2SDK.createDice();
    await user3SDK.createDice();

    await sleep(15000);
    let results = [
      await user0SDK.claimDice(),
      await user1SDK.claimDice(),
      await user2SDK.claimDice(),
      await user3SDK.claimDice(),
    ];

    console.log(results);
  });
});
