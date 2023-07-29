const HotPocket = require("hotpocket-nodejs-contract");
const evp = require('everpocket-nodejs-contract');
const { MembershipRegistry } = require("./membership-registry");
const { ClusterWallet } = require("./cluster-wallet");
const { attemptBootstrap } = require("./bootstrapper");

const contract = async (contractCtx) => {

    const registry = new MembershipRegistry(contractCtx);

    const bootstrapped = await registry.init();
    console.log("Membership contract.", `bootstrapped: ${bootstrapped}`);

    if (!bootstrapped) {
        await attemptBootstrap(contractCtx, registry);
        return;
    }

    // Reaching here means the cluster bootstrap is complete.

    if (contractCtx.readonly) {
        // Handle any read requests.
        return;
    }

    // Reaching here means the cluster bootstrap is complete and we are in the consensus execution mode.
    // All the normal operational work of the contract happens here.

    // Configure the contexts provided by everpocket. In the membership contract, we are going to mainly make
    // use the HotPocketContext and XrplContext.

    const hotPocketContext = new evp.HotPocketContext(contractCtx);
    contractCtx.unl.onMessage((node, msg) => hotPocketContext.voteContext.feedUnlMessage(node, msg));

    // Cluster wallet class contains logic of maintaining the cluster wallet with vairous membership operations.
    const wallet = new ClusterWallet();
    try {
        await wallet.init(registry, hotPocketContext);

        // Periodically rotate the signers.
        if (contractCtx.lclSeqNo % 100 === 0) {
            await wallet.rotateSigners();
        }
    }
    catch (err) {
        console.log("Wallet error", err);
    }
    finally {
        await wallet.deinit();
    }

    for (const user of contractCtx.users.list()) {
        for (const input of user.inputs) {
            const buffer = await contractCtx.users.read(input);
            const msg = JSON.parse(buffer.toString());

            if (msg.type === "membership_request" && msg.pubkey && msg.netAddress && msg.peerPort && msg.userPort) {
                // {
                //     type: "membership_request",
                //     pubkey: "",
                //     netAddress: "",
                //     peerPort: 1111,
                //     userPort: 2222,
                // }

                // TODO: We need support to also perform node's public key verification via this convenience method.
                if (await hotPocketContext.checkLiveness(msg.netAddress, msg.peerPort)) {
                    await registry.enrollForMembership(msg.pubkey, msg.netAddress, msg.peerPort, msg.userPort);
                }
                else {
                    console.log("Cannot enroll member. Liveness probe failed.", msg);
                }
            }
            else {
                console.log("Malformed input.", msg);
            }
        }
    }
}

const hpc = new HotPocket.Contract();
hpc.init(contract);