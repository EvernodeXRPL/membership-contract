# Membership Contract
This is a contract to demonstrate the "membership model" for cluster management. It means anyone can instantiate their own copy of the contract and the existing UNL cluster can accept the new node into the UNL according to a predefined criteria. In this model, every instance of the UNL cluster is owned by an independant party and they are responsibile for funding their instance as long as they wish to be a member of the cluster.

This model is losely demonstrated in the [instance synchronization HotPocket tutorial](https://github.com/EvernodeXRPL/evernode-sdk/blob/main/hotpocket/tutorial-instance-sync.md#spawn-a-new-node)

## Challenges
1. Advertising - For someone to create a new copy and request to join the membership, they have to know details about existing UNL nodes. This calls for a well-known trustworthy location that they can refer to attain the details.
2. Bad nodes - The cluster should be able recognize and kick any non-responsive members from the UNL. Otherwise an increasing number of non-responsive UNL nodes will halt the cluster forever.
3. Acceptance - New nodes must have a mechanism to introduce themselves to the existing UNL cluster.
4. Recharging - The owners of member instances must have a mechanism to continually fund their instances so they don't die.

### 1. Advertising
There should be a well-known public location that anyone can visit and witness the existing UNL information. This would include the public keys and network address/port details of the UNL nodes. This information is required for the new joinee to configure their instance so the new instance auto-syncs with the existing UNL and becomes a replica.

Ideally, it should be the contract cluster which maintains and updates this information on the well-known location. This means the UNL nodes should have decentralized publishing rights on the location so that no single node/party can tamper with the published information. Therefore we cannot use traditional publishing platforms like cloud storage, github etc... to achieve this since they use centralized credentials.

#### 1.1 Cluster wallet
The approach which fits us is to use a **multi-sign-enabled XRPL account** owned by the cluster which we'll call as "cluster wallet". The information about each UNL node could then be represented as a [URIToken](https://github.com/XRPLF/XRPL-Standards/pull/110/files) containing the node's public key, network address and port information. Each new membership acceptance and revocation will result in the minting and burn of the corresponding uri token. The cluster will also keep a file of its own (in the "state" filesystem) containg the list of node details along with the uri token id respresenting each node.

#### 1.2 Signer nodes
All XRPL transactions concerning uri tokens needs to be issued as multi-sign txns signed by multiple nodes in the cluster. This in turn calls for the need to have "signer nodes" among the UNL cluster. There's no hard-limit for the number of UNL nodes, but the XRPL signer list is limited to 32 signers. Therefore if the UNL is greater than 32, the cluster needs to nominate a subset of UNL nodes to be signers holding their own individual XRPL private keys. Ideally, the signers should be periodically rotated among the UNL nodes as well. It's worth noting that updating the cluster wallet's signer list itself is a multi-sign txn issued by the existing signer nodes.

### 2. Bad nodes
The membership contract should posses the smartness to identify and remove bad nodes/members. To ensure liveliness of the cluster, it's essential to remove any nodes which are not participating in consensus. We could use UNL node communication timestamp information provided by HotPocket to identify such nodes and kick them out of our UNL. We could also use our own statistics based on [NPL messages](https://github.com/EvernodeXRPL/evernode-sdk/blob/main/hotpocket/tutorial-npl.md) to improve the smartness.

### 3. Acceptance
A newly-spawned potential member instance should be able to inform about itself to the UNL nodes so they can add the new member to the UNL and update the advertising information mentioned above. The acceptance request should include the public key, network address and port information of the new member and optionally a proof of eligibility (eg. membership payment). Since UNL nodes does not trust messages from any non-UNL nodes, this needs to be submited to the cluster as a user input.

In Evernode, when a new HotPocket instance is created, the instance itself has access to its own public key but not the network address/ports of the instance is reachable at. Therefore the instance itself cannot submit the membership acceptance request due to network address information not being available. However, the creator of the instance receives the [lease acquire response](https://github.com/EvernodeXRPL/evernode-sdk/blob/main/evernode/reference-api-tenant.md#response-format), which contains all the information we need for membership acceptance request. Therefore the instance owner could submit the membership acceptance request as a HotPocket user input to any of the UNL nodes with the help of a client application.

### 4. Recharging
When a new HotPocket instance is created in Evernode, it must pay the lease amount in Evers which would dictate how long the instance will keep running. The instance will keep running for that number of Moments (roughly 1 Moment = 1 hour) based on the per-Moment lease amount charged by the Host. If the owner of the instance (a.k.a Tenant), is interested in running the instance further they should [Extend lease](https://github.com/EvernodeXRPL/evernode-sdk/blob/main/evernode/reference-api-tenant.md#extend-lease---async-extendleasehostaddress-moments-instancename-options--) with the amount of Evers corresponding to how many more Moments that it should run. The instance owner must decide this based on their future expectations of the instance and also how trusteorthy is the host they are paying to.

Due to the ongoing funding that is required for "extending" the lease of an instance, there should be a tool which automates this and keeps the instance alive using the funds from the Tenant XRPL account.
