const HotPocket = require("hotpocket-nodejs-contract");
const evp = require('everpocket-nodejs-contract');
const { MembershipRegistry } = require("./membership-registry");
const { ClusterWallet } = require("./cluster-wallet");
const process = require("process");

const contract = async (contractCtx) => {

    const registry = new MembershipRegistry(contractCtx);

    const bootstrapped = await registry.init();
    console.log("Membership contract.", `bootstrapped: ${bootstrapped}`);

    if (!bootstrapped) {
        await handleBootstrapInputs(contractCtx, registry, wallet);
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
    const xrplContext = new evp.XrplContext(this.hotPocketContext, this.xrpl.address, this.xrpl.secret);
    await xrplContext.init();

    // Cluster wallet class contains logic of maintaining the cluster wallet with vairous membership operations.
    const wallet = new ClusterWallet(registry, xrplContext);
    await wallet.init();

    // Periodically rotate the signers.
    if (contractCtx.lclSeqNo % 100) {
        await wallet.rotateSigners();
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

async function handleBootstrapInputs(contractCtx, registry, wallet) {

    for (const user of contractCtx.users.list()) {

        for (const input of user.inputs) {
            const buffer = await contractCtx.users.read(input);
            const msg = JSON.parse(buffer.toString());

            if (msg.type.endsWith("_bootstrap")) {


                if (contractCtx.readonly) {
                    console.log("Cannot bootstrap in readonly mode.");
                    return false;
                }

                // ed55219 hex public key of the user authorized for submitting the bootstrap input.
                const authorizedUserPubKey = process.argv.splice(2)[0];
                if (!authorizedUserPubKey) {
                    console.log("Authorized user for bootstrapping the cluster not specified.");
                    return false;
                }

                if (user.publicKey === authorizedUserPubKey) {

                    let success = false;

                    if (msg.type === "origin_bootstrap" && msg.cluster && msg.node) {

                        // {
                        //     type: "origin_bootstrap",
                        //     cluster: {
                        //         walletAddress: "",     // Cluster wallet address
                        //     },
                        //     node: {
                        //         walletSecret: ""       // This node's signing secret
                        //     }
                        // }

                        await wallet.persistAddress(msg.cluster.walletAddress);
                        await wallet.persistSecret(msg.node.walletSecret);
                        success = true;
                    }
                    else if (msg.type === "node_bootstrap" && msg.node && msg.origin &&
                        msg.origin.pubkey && msg.origin.netAddress && msg.origin.peerPort) {

                        // {
                        //     type: "node_bootstrap",
                        //     node: {
                        //         walletSecret: ""       // This node's signing secret
                        //     }
                        //     origin: {
                        //         pubkey: "public key of node 1",
                        //         netAddress: "network address of node 1",
                        //         peerPort: "peer port of node 1"
                        //     }
                        // }

                        // Set the private wallet secret.
                        await wallet.persistSecret(msg.node.walletSecret);

                        // Set our UNL to the origin node's public key.
                        const hpconfig = await contractCtx.getConfig();
                        hpconfig.unl = [msg.origin.pubkey];
                        await contractCtx.updateConfig(hpconfig);

                        // Add the connection information of the origin node.
                        contractCtx.updatePeers([`${msg.origin.netAddress}:${msg.origin.peerPort}`]);
                        success = true;
                    }
                    else if (msg.type === "membership_bootstrap") {

                        // {
                        //     type: "membership_bootstrap",
                        //     memberships: [{      // Array containing information about all nodes in the initial cluster
                        //         pubkey: "",
                        //         netAddress: "",
                        //         peerPort: 1111,
                        //         userPort: 2222,
                        //     }, {
                        //         pubkey: "",
                        //         netAddress: "",
                        //         peerPort: 3333,
                        //         userPort: 4444,
                        //     },...]
                        // }

                        registry.bootstrap(msg.memberships);
                        success = true;
                    }
                    else {
                        console.log("Malformed bootstrap input.", msg);
                    }

                    user.send(JSON.stringify({ result: success ? "success" : "error" }));
                    return success;
                }
                else {
                    console.log("Unauthorized user for bootstrapping.", user.publicKey);
                    return false;
                }
            }
        }
    }
}