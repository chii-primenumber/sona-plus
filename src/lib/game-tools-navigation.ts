export type GameToolsMode='bp'|'game'|'lobby'
let navigate:((view:'history'|'build',mode:GameToolsMode)=>void)|null=null
export function setGameToolsNavigation(handler:typeof navigate){navigate=handler}
export function openGameTools(view:'history'|'build',mode:GameToolsMode){navigate?.(view,mode)}
