const fs = require("fs");

const membershipStatus = {
    pending: 'pending', // Membership request submitted but not accepted into unl yet.
    member: 'member',
    revoked: 'revoked' // Membership has been revoked.
};
Object.freeze(membershipStatus);

// This class manages the memberships.
class MembershipRegistry {

    membershipsFile = "memberships.json"; // Keeps the shared cluster membership information.
    memberships = [];
    contractCtx;
    selfIsSigner = false; // Indicates whether this node is one of the cluster wallet signers.

    constructor(contractCtx) {
        this.contractCtx = contractCtx;
    }

    async init() {
        // In the begning, there are no memberships on file. Initial memberships need to be added via a
        // a soecial bootstrap user input containing the initial unl.
        if (fs.existsSync(this.membershipsFile)) {
            this.memberships = JSON.parse((await fs.promises.readFile(this.membershipsFile)).toString())
            this.selfIsSigner = this.memberships.find(m => m.pubkey === this.contractCtx.publicKey && m.isSigner);
            return true;
        }
        else {
            this.memberships = [];
            return false;
        }
    }

    async grantMembership(pubkey, uriToken) {
        const member = this.memberships.find(m => m.pubkey === pubkey);
        member.status = membershipStatus.member;
        member.uriToken = uriToken;
        await this.#persist();
    }

    async revokeMembership(pubkey) {
        const member = this.memberships.find(m => m.pubkey === pubkey);
        member.status = membershipStatus.revoked;
        await this.#persist();
    }

    async purgeMembership(pubkey) {
        this.memberships = this.memberships.filter(m => m.pubkey !== pubkey);
        await this.#persist();
    }

    // This is called during the cluster initalization to make the initial unl.
    // This assumes the XRPL account has already been setup with the multi-sign keys of the initial nodes.
    async bootstrap(members) {

        if (!members || members.length === 0) {
            console.log("Invalid member bootstrap info.");
            return false
        }

        this.memberships = members.map(n => {
            return {
                pubkey: n.pubkey,
                netAddress: n.netAddress,
                peerPort: n.peerPort,
                userPort: n.userPort,
                status: membershipStatus.pending, // All initial members are added as 'pending' since uri tokens are not minted yet.
                isSigner: true, // All initial members are assumed to be signers.
                uriToken: null
            }
        });
        this.#persist();

        // Set the HotPocket unl to be the public keys of the initial members.
        const hpconfig = await this.hpContext.getContractConfig();
        hpconfig.unl = this.memberships.map(m => m.pubkey);
        await this.hpContext.updateContractConfig(hpconfig);

        // Update the peer list so this node forms connection to all the members.
        const peers = this.memberships.map(m => `${m.netAddress}:${m.peerPort}`);
        await this.contractCtx.updatePeers(peers);
        return true;
    }

    async #persist() {
        await fs.promises.writeFile(this.membershipsFile, JSON.stringify(this.memberships));
    }
}

module.exports = {
    MembershipRegistry,
    membershipStatus
}