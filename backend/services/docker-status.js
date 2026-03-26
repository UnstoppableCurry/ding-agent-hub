import Docker from 'dockerode';
import config from '../config.js';

const TARGETS = config.monitorContainers;

export async function getContainerStatuses() {
  try {
    const docker = new Docker({ socketPath: config.dockerSocket });
    const containers = await docker.listContainers({ all: true });

    const result = {};
    for (const name of TARGETS) {
      const container = containers.find(c => c.Names.some(n => n === `/${name}` || n === name));
      if (container) {
        result[name] = {
          status: container.State,
          uptime: container.Status,
          image: container.Image,
        };
      } else {
        result[name] = { status: 'not found' };
      }
    }
    return result;
  } catch (e) {
    return { error: e.message };
  }
}
