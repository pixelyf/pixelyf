import * as PIXI from 'pixi.js'

export interface GalaxyLayers {
  background: PIXI.Graphics
  starField: PIXI.Container
  nebula: PIXI.Container
  connection: PIXI.Graphics
  pixel: PIXI.Container
  effect: PIXI.Container
}

export function createLayers(app: PIXI.Application): GalaxyLayers {
  const layers: GalaxyLayers = {
    background: new PIXI.Graphics(),
    starField: new PIXI.Container(),
    nebula: new PIXI.Container(),
    connection: new PIXI.Graphics(),
    pixel: new PIXI.Container(),
    effect: new PIXI.Container(),
  }

  app.stage.addChild(layers.background)
  app.stage.addChild(layers.starField)
  app.stage.addChild(layers.nebula)
  app.stage.addChild(layers.connection)
  app.stage.addChild(layers.pixel)
  app.stage.addChild(layers.effect)

  return layers
}
