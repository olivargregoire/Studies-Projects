# Homelab Project 1 — Reverse Proxy + 2 Node apps + Postgres

This was my first proper Docker Compose project and has been done when I was at ENSEEIHT. The goal was to learn how several containers talk to each other and to do a bit of container networking: a reverse proxy in front, two small Node.js apps behind it, and a Postgres database that the apps can query.
Nothing fancy, but I wanted to understand the *networking* and the *routing*
properly instead of just copy-pasting a tutorial.

## What's inside

```
Homelab-projects-1/
├── docker-compose.yml      # the whole stack, docker orchestrator
├── nginx/                  # the reverse proxy (entry point)
│   ├── Dockerfile
│   └── default.conf
├── app1/                   # Node HTTP server, listens on :3000
│   ├── Dockerfile
│   ├── package.json        # depends on "pg" so it can send request to the db
│   └── src/index.js
├── app2/                   # second Node HTTP server, listens on :3001
│   ├── Dockerfile
│   ├── package.json        # depends on "pg" so it can send request to the db
│   └── src/index.js
└── db/postgres/            # Postgres 16
    ├── Dockerfile
    └── init.sql            # creates a few fake databases
```

## How it works (the architecture)


The important idea that I wanted to put in place:  **only nginx is exposed to my machine** (`ports: "80:80"`). The apps and the database are NOT reachable directly from outside, and you have to go through this nginx to reach apps. Moreover only the apps have access to the database. There is no direct access between the db and nginx proxy, this goes through the app.

### The services

- **nginx (proxy)** — the entry point on port 80. Its configuration describes blocks defined by : 
  - the `location` : what request match the block? (for example, location /app1 will match all request with url that starts by app1/).
  - the `proxy_pass` where to send : once a request is caught in a location block, it needs to describe where the request needs to be sent.

- **app1** — a small Node `http` server on port 3000. The routes are:
  - `/app1/health` → it is supposed to return `{ "status": "ok" }`
  - `/app1/db` → asks Postgres for the list of databases and returns it as JSON. I used the pg library and used a pool to have few tcp connections open to the database.

- **app2** — The same thing but on port 3001.

- **postgres** — Postgres 16. User `greg`, database `my_database`. On the very
  first start it runs `init.sql` which creates some fake databases
  (`inventory`, `billing`, `analytics`, `staging`) so I have something to list.

## The nginx routing

This took me much more time than it should have, so I'm writing it down. The config I ended up with :

```nginx
location /app1/ {
    proxy_pass http://app1:3000/;
}
```

The key thing: the trailing slash on `location /app1/` **and** on
`proxy_pass http://app1:3000/;` must both be there. When they match like this, nginx removes the `/app1/` prefix before forwarding, so:

- request `localhost/app1/db` → app1 actually receives `/db`
- request `localhost/app1/health` → app1 actually receives `/health`

That's why my apps only define `/db` and `/health` (no `/app1` prefix in the
code) — nginx already stripped it. app1 and app2 work exactly the same way.

What I learned while getting there (the mistakes I made first):

- `proxy_pass http://app1:3000;` (no trailing slash) forwards the **full** URL,
  so app1 received `/app1/db` and my `if (req.url === '/db')` never matched.
- Mixing the slashes (slash on `proxy_pass` but not on `location`) gave me a
  `//db` (double slash) and even a `301` redirect.
- So `location` and `proxy_pass` have to **agree** on whether the prefix is kept
  or removed. I debugged it by adding `console.log(req.url)` in the app and
  reading `docker compose logs`.

Other stupid errors I did bugs I hit:
- `502 Bad Gateway` → the app behind nginx crashed. In my case app2 was using
  `require('pg')` but I forgot to add `pg` to its `package.json`, so it crashed
  on startup with `Cannot find module 'pg'` (the npm install from the Dockerfile was not installing the package at all)
- Wrong DB password in the app → the `/db` route returns a `500`. The real
  password lives in `db/postgres/Dockerfile`.


## Networking (the part I really wanted to explore)

First of all, I have been practicing docker networking thanks to iximiuz and all his lab, especially the one where you have to build container networking from scratch: 
- Tutorial https://labs.iximiuz.com/tutorials/container-networking-from-scratch
- Final lab https://labs.iximiuz.com/challenges/reproduce-docker-bridge-network

Basically when spawning a container, the container runtime creates its own network namespace with its own network stack. 

This netns only has a loopback interface and can't reach anything, or be reached. To connect it to the host then, the linux kernel creates a **veth pair**: a virtual cable with two ends. One end stays in the host (root namespace), the other goes inside the container's namespace and gets an IP. That's enough for one container.

The problem starts when we have more than one containers in the same subnet: if we give both host-side ends an IP in the same network (so they can communicate) `172.18.0.0/16`, the host's routing table ends up with two routes (for the two veth on host) for the same network → they clash and connectivity breaks.

 The fix is to use a **Linux bridge** (`br0`), which is basically a virtual switch working at L2 level (Ethernet). We then attach both veth host-ends to the bridge, leave them without IPs, and the containers talk to each other through the switch regardless of routing. Then we obtain network basic driver from Docker. I just have to route all my traffic for any container to go through the bridge. 

To reach the host, we need to give the **bridge itself an IP** (`172.18.0.1`) — it
becomes the containers' default gateway. To reach the **internet**, two more
things are needed:
- `ip_forward = 1` so the host acts as a router,
- a **NAT / masquerade** iptables rule, so outbound packets get the host's
  public IP as source (private container IPs aren't routable on the internet).

And to let the the container being accesible from the internet (not the case here and on the scheme), we would have to publish a port: an
iptables `DNAT` rule forwards `host_ip:port` to `container_ip:port`. That's
literally what `ports: "80:80"` does under the hood.

![Container Networking with two containers](./container_basic_networking.svg)

For my project, I am going to need several network to have an isolation between the reverse proxy, the backend, and the db.

A "Docker network" = a bridge + a subnet + the iptables rules around it. I used IPAM that is a Docker subsystem distributing and following the IP address for the network. It defines what subnet is used, what is the network gateway and what IP we should give to each veth in each container joining a specific network.

I used 3 different networks, one per "trust zone":
```
networks:
  frontend:
    driver: bridge
    ipam:
      config:
        - subnet: 192.168.1.0/24
  backend:
    driver: bridge
    internal: true
    ipam:
      config:
        - subnet: 192.168.2.0/24
  dbs:
    driver: bridge
    internal: true
    ipam:
      config:
        - subnet: 192.168.3.0/24
```

Each network is a separate bridge, so I end up with **3 bridges** and they can only talk to each other if they are in the same network.

My intended zones are:

- **`frontend`** — the only network *without* `internal: true`, so it's the only one with outside access (paired with `ports: "80:80"`). Only nginx lives here.

- **`backend`** (`internal: true` : no SNAT configured) : that's where nginx forwards traffic
  to `app1` and `app2`. The apps can't call out to the internet from here.

- **`dbs`** (`internal: true`) — meant to be the database-only zone, so that
  **only the apps** can reach Postgres and the proxy cannot talk to it directly.

The flow I'm aiming for is a clean chain: `internet → nginx → apps → db`, where
each layer only sees its direct neighbour.



## How to run it

```bash
cd Homelab-projects-1

# build and start everything
docker compose up --build -d

# check it's alive
curl localhost/test            # -> Hello from Nginx!
curl localhost/app1/health     # -> {"status":"ok"}
curl localhost/app1/db         # -> {"databases":[...]}

# logs if something breaks
docker compose logs -f app1
docker compose ps
```

If I change `init.sql`, I have to recreate the volume so it runs again:

```bash
docker compose down -v         # the -v drops the volume
docker compose up --build -d
```
