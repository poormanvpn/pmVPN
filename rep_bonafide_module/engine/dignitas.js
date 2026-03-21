
export function calculateDignitas(data){
let score=0
score+=data.vouches*50
score+=data.governance*20
score+=data.history*10
return score
}
