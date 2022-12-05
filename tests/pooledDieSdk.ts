import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PooledDie } from "../target/types/pooled_die";
import { TOKEN_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";
import { SwitchboardTestContext } from "@switchboard-xyz/sbv2-utils";
import * as sbv2 from "@switchboard-xyz/switchboard-v2";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { AccountMeta } from "@solana/web3.js";

export class PooledDieSDK {
  program: Program<PooledDie>;
  provider: anchor.AnchorProvider;
  switchboard: SwitchboardTestContext;

  VRFAccountListTag = "vrf_account_list";
  DiceTag = "dice";

  constructor(program: Program<PooledDie>, wallet?: anchor.Wallet) {
    // If given another wallet
    if (wallet) {
      this.provider = new anchor.AnchorProvider(
        program.provider.connection,
        wallet,
        { commitment: `confirmed` }
      );
      this.program = new anchor.Program(
        program.idl,
        program.programId,
        this.provider
      );
    }
    // Otherwise use default
    else {
      this.program = program;
      this.provider = program.provider as anchor.AnchorProvider;
    }
  }

  /**
   *  Create Switchboard test environment and wait for oracle hearbeat
   * @param tokenAmount Amount of wSOL to initialize test context with
   */
  createSwitchboardTestContext = async (tokenAmount: number = 6_000_000) => {
    this.switchboard = await SwitchboardTestContext.loadFromEnv(
      this.program.provider as anchor.AnchorProvider,
      undefined,
      tokenAmount
    );

    await this.switchboard.oracleHeartbeat();
  };

  // Instructions

  /**
   * Initializes global state and empty Vrf pool
   * @returns transaction sig promise
   */
  initialize = async () => {
    let switchboardStateBump = this.getSwitchboardStateBump();

    return await this.program.methods
      .initialize(switchboardStateBump)
      .accounts({
        admin: this.getPayer().publicKey,
      })
      .rpc();
  };

  /**
   * Enlarges VrfAccountList by adding new VrfAccounts to it
   * @param size How many new accounts to add
   */
  enlargePool = async (size: number = 5) => {
    // Initialize some VrfAccounts
    let vrfAccountsPromises = [...Array(size)].map((e) =>
      this.createVrfAccount(anchor.web3.Keypair.generate())
    );

    let vrfAccounts = await Promise.all(vrfAccountsPromises);

    // Call program method
    let remainingAccounts: AccountMeta[] = vrfAccounts.map((acc) => {
      return {
        pubkey: acc.vrfAccount.publicKey,
        isSigner: false,
        isWritable: false,
      };
    });

    await this.program.methods
      .enlargePool()
      .accounts({
        admin: this.getPayer().publicKey,
      })
      .remainingAccounts(remainingAccounts)
      .rpc();
  };

  /**
   * Creates and rolls a dice (requesting randomness through CPI using VrfAccount pool)
   */
  createDice = async () => {
    let candidateVrfAccount = await this.getCandidateVrfAccount();
    let [sbContext, bumps] = await this.getRequestRandomnessSwitchboardContext(
      candidateVrfAccount
    );

    await this.program.methods
      .createDice(bumps.permissionBump)
      .accounts({
        player: this.getPayer().publicKey,
        playerWallet: this.switchboard.payerTokenWallet,
        ...sbContext,
        recentBlockhashes: anchor.web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
      })
      .signers([this.getPayer().payer])
      .rpc();
  };

  /**
   * Allows user to claim their dice (basically just msg!() the rolled face if != 0)
   * @returns Rolled face, player pubkey
   */
  claimDice = async () => {
    let [dice] = findProgramAddressSync(
      [Buffer.from(this.DiceTag), this.getPayer().publicKey.toBuffer()],
      this.program.programId
    );

    let diceData = await this.program.account.dice.fetch(dice);

    await this.program.methods
      .claimDice()
      .accounts({
        player: this.getPayer().publicKey,
        dice,
      })
      .signers([this.getPayer().payer])
      .rpc();

    return {
      rolledFace: diceData.face,
      player: this.getPayer().publicKey.toBase58(),
    };
  };

  // Other functions

  /**
   * Creates a VrfAccount and grants permission
   * @param keypair Keypair to create account at
   * @returns
   */
  createVrfAccount = async (keypair: anchor.web3.Keypair) => {
    // Create VrfAccount
    let [vrfAccountAuthority] = this.getVrfAccountListPDA();

    let vrfAccount = await sbv2.VrfAccount.create(this.switchboard.program, {
      keypair,
      authority: vrfAccountAuthority,
      queue: this.switchboard.queue as sbv2.OracleQueueAccount,
      callback: {
        programId: this.program.programId,
        accounts: [],
        ixData: Buffer.from(``),
      },
    });

    // Create PermissionAccount
    const { unpermissionedVrfEnabled, authority: queueAuthority } =
      await this.switchboard.queue.loadData();
    const permissionAccount = await sbv2.PermissionAccount.create(
      this.switchboard.program,
      {
        authority: queueAuthority,
        granter: this.switchboard.queue.publicKey,
        grantee: vrfAccount.publicKey,
      }
    );

    // If queue requires permissions to use VRF, check the correct authority was provided and grant it
    if (!unpermissionedVrfEnabled) {
      if (!this.getPayer().publicKey.equals(queueAuthority)) {
        throw new Error(
          `queue requires PERMIT_VRF_REQUESTS and wrong queue authority provided`
        );
      }

      await permissionAccount.set({
        authority: this.getPayer().publicKey,
        permission: sbv2.SwitchboardPermission.PERMIT_VRF_REQUESTS,
        enable: true,
      });
      console.log(`Set VRF Permissions`);
    }

    return { vrfAccount, permissionAccount };
  };

  /**
   *
   * @returns Pubkey and bump of the PDA used to store the VrfAccount pool,
   * which works as their authority as well
   */
  getVrfAccountListPDA = () => {
    return findProgramAddressSync(
      [Buffer.from(this.VRFAccountListTag)],
      this.program.programId
    );
  };

  /**
   *
   * @param vrfAccount Existing vrfAccount whose permission we want to find
   * @returns [PermissionAccount, bump] for the given VrfAccount
   */
  getPermissionAccount = async (vrfAccount: anchor.web3.PublicKey) => {
    const { authority: queueAuthority } =
      await this.switchboard.queue.loadData();

    let out = sbv2.PermissionAccount.fromSeed(
      this.switchboard.program,
      queueAuthority,
      this.switchboard.queue.publicKey,
      vrfAccount
    );

    return { permissionAccount: out[0], permissionAccountBump: out[1] };
  };

  /**
   *
   * @returns Keypair of provider's wallet
   */
  getPayer = () => {
    return this.provider.wallet as NodeWallet;
  };

  /**
   *
   * @param vrfAccountPubkey Public key of the VrfAccount used to request randomness
   * @returns Promise of request randomness Switchboard context + bumps
   */
  getRequestRandomnessSwitchboardContext = async (
    vrfAccountPubkey: anchor.web3.PublicKey
  ) => {
    // Instantiate VrfAccount and get Queue
    const vrfAccount = new sbv2.VrfAccount({
      program: this.switchboard.program,
      publicKey: vrfAccountPubkey,
    });
    const vrfState = await vrfAccount.loadData();

    // Instantiate Queue and get QueueAuthority
    const queueAccount = new sbv2.OracleQueueAccount({
      program: this.switchboard.program,
      publicKey: vrfState.oracleQueue,
    });
    const queueState = await queueAccount.loadData();

    // Derive PermissionAccount
    const [permissionAccount, permissionBump] = sbv2.PermissionAccount.fromSeed(
      this.switchboard.program,
      queueState.authority,
      queueAccount.publicKey,
      vrfAccount.publicKey
    );

    // Derive Switchboard ProgramState
    const [switchboardStateAccount, switchboardStateBump] =
      sbv2.ProgramStateAccount.fromSeed(this.switchboard.program);

    return [
      {
        vrfAccount: vrfAccount.publicKey,
        oracleQueue: queueAccount.publicKey,
        queueAuthority: queueState.authority,
        dataBuffer: queueState.dataBuffer,
        permission: permissionAccount.publicKey,
        escrow: vrfState.escrow,
        switchboardState: switchboardStateAccount.publicKey,
        switchboardProgram: this.switchboard.program.programId,
      },
      { permissionBump, switchboardStateBump },
    ];
  };

  /**
   *
   * @returns Gets the next VrfAccount pointed to
   */
  getCandidateVrfAccount = async () => {
    let { vrfAccountPointer } = await this.getGlobalState();
    let vrfAccountList = await this.getVrfAccountList();

    return vrfAccountList.list[vrfAccountPointer];
  };

  /**
   *
   * @returns Global state struct
   */
  getGlobalState = async () => {
    let accounts = await this.program.account.globalState.all();

    return accounts[0].account;
  };

  /**
   *
   * @returns On-chain VrfAccount list
   */
  getVrfAccountList = async () => {
    let [address] = this.getVrfAccountListPDA();

    return await this.program.account.vrfAccountList.fetch(address);
  };

  /**
   *
   * @returns Switchboard global state PDA bump
   */
  getSwitchboardStateBump = () => {
    // Derive Switchboard ProgramState
    const [switchboardStateAccount, switchboardStateBump] =
      sbv2.ProgramStateAccount.fromSeed(this.switchboard.program);

    return switchboardStateBump;
  };
}
