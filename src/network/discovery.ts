import { Bonjour, type Service, type Browser } from "bonjour-service";
import { EventEmitter } from "node:events";

const SERVICE_TYPE = "c2c";

export interface DiscoveredNode {
  nodeId: string;
  nodeName: string;
  host: string;
  wsPort: number;
}

export class DiscoveryService extends EventEmitter {
  private bonjour: Bonjour;
  private publishedService: any = null;
  private browser: Browser | null = null;
  private nodeId: string;
  private nodeName: string;
  private wsPort: number;

  constructor(nodeId: string, nodeName: string, wsPort: number) {
    super();
    this.bonjour = new Bonjour();
    this.nodeId = nodeId;
    this.nodeName = nodeName;
    this.wsPort = wsPort;
  }

  publish(): void {
    this.publishedService = this.bonjour.publish({
      name: `c2c-${this.nodeId.slice(0, 8)}`,
      type: SERVICE_TYPE,
      port: this.wsPort,
      txt: {
        nodeId: this.nodeId,
        nodeName: this.nodeName,
        wsPort: String(this.wsPort),
      },
    });
  }

  browse(): void {
    this.browser = this.bonjour.find({ type: SERVICE_TYPE });
    const browser = this.browser;

    browser.on("up", (service: Service) => {
      const txt = service.txt as Record<string, string> | undefined;
      if (!txt?.nodeId || txt.nodeId === this.nodeId) return;

      const node: DiscoveredNode = {
        nodeId: txt.nodeId,
        nodeName: txt.nodeName || "unknown",
        host: service.referer?.address || service.host,
        wsPort: parseInt(txt.wsPort, 10) || service.port,
      };
      this.emit("discovered", node);
    });

    browser.on("down", (service: Service) => {
      const txt = service.txt as Record<string, string> | undefined;
      if (txt?.nodeId) {
        this.emit("lost", txt.nodeId);
      }
    });
  }

  stop(): void {
    if (this.publishedService) {
      this.publishedService.stop?.();
    }
    if (this.browser) {
      this.browser.stop();
    }
    this.bonjour.destroy();
  }
}
