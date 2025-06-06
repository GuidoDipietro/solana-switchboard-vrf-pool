# ⚠️ NOTICE ⚠️

**This repository is old and unmaintained. It uses outdated versions of everything. There are many vulnerabilities. Please only use this for learning purposes. This wasn't intended to be used in productive environments.**

---

# solana-switchboard-vrf-pool

Example Solana program using Switchboard's VRF and a VrfAccount pool schema

# What does this do?

This is a Solana program that allows users to request randomness using [Switchboard](https://github.com/switchboard-xyz/switchboard-v2)'s VRF, in a "multi-threaded" way, using resources more efficiently.

# What's that about resources?

VRF requests need a VrfAccount to be available. Think of this as a store where you queue amongst other people to finally get to the cashier or something.

In the same way cashiers take a salary, VrfAccounts have a cost to be created. Users can either have:

- Their own "cashier" (one VrfAccount per user) which will always be free since only they can use it
   - **Most expensive and inefficient schema, you pay too many cashiers and they are almost always doing nothing**
- Only one "cashier" (one VrfAccount altogether) which will be mostly always used
   - **Cheapest schema, bad user experience, queue is always too long**
- A few "cashiers" (several VrfAccounts at disposal, pool) which gives a max cap of N users that the program can handle simultaneously
   - **Best use of resources**

# How it's done

This program has the following instructions:

- `initialize()` - Admin initializes the program with basic global state and empty VrfAccount pool
- `enlarge_pool()` - Admin can add VrfAccounts to the pool
- `create_dice()` - User can create a dice (PDA with one field `face: u8`). Randomness is requested here
- `settle_dice()` - Unpermissioned function set as callback; Switchboard calls here when the randomness is ready
- `claim_dice()` - User can claim a dice that has been rolled (just logs the rolled value)

An SDK is provided to easily interact with this program, in which an admin can just call `sdk.enlargePool(size)` to increase the pool's size if they find the size is too small for the number of users.

# Testing

Install the dependencies:

```
yarn add \
        @switchboard-xyz/sbv2-utils \
        @switchboard-xyz/switchboard-v2 \
        @solana/web3.js \
        @project-serum/anchor@^0.25.0 \
        @project-serum/borsh \
        bn.js
yarn add -D \
        @switchboard-xyz/cli@^2 \
        anchor-client-gen \
        @types/bn.js
```

Create Switchboard local test environment:

```
sbv2 solana localnet env --keypair ~/.config/solana/id.json --outputDir .switchboard
echo ".switchboard" >> .gitignore
```

Now, according to Switchboard you can run this using only one command, but it doesn't work for me. So just open two more terminals and run these commands:

```
# Shell 1
.switchboard/start-local-validator.sh

# Shell 2
.switchboard/start-oracle.sh

# Shell 3
anchor build; anchor deploy; anchor run test
```
