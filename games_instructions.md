I want you to make a game of miners vs assasins in a maze. The game is called Claustrophobia: Can you outrun the blade?

ROLES AND PRIVILEGES:
1. Admin
    - Admin will be the person that start the games
    - Can see maze with all the pawns of teams played
    - Can eliminate the current miner / assassins team (because the battle will be played offline)
    - Admin side will be seen in the LCD Projector as a watch party so that everyone can see whats going on in the game
2. Miners
    - Miners team will be running in the maze
    - 1 Team of miners will be consists of many people, they will playing one by one, one person equals to 1 life. If reach zero then the miners team eliminated. Only 1 miner will logon to the game.
    - 1 of miner team will be the Navigator
    - Miners screen will be blank for now, but just prepare if i had other thinking about the game
3. Navigator (Miner's team also)
    - Navigator will be in the separate room from the miners team
    - Navigator's job is to navigate the miners through the maze, the miners cant navigate the maze themselves
    - The navigator screens will show only a navigation (up, left, down, right)
    - Navigator will know the coordinates of assassins. Showing only x,y format.
4. Assassins
    - Assassins is the team that is job is eliminate the miners team one by one. They will navigate the maze by themselves
    - Only 1 person needed to logon into the game as well
    - Assassin's screen will show navigation (up, left, down, right), and the current condition of the maze including all the location for the miner team, and also the treasure chest and vault.
    - Their job is to eliminate the miners, if assassin encounter miner in the same grid cell, then they will play a game (offline). Just give a screen showing "BATTLE BEGIN", then if the offline game is done, admin can continue the game.

MAZE SPECIFICATION:
- 10x10 grid
- 10 Treasure Chest located at random, dont spawn doubles in 3 tiles radius. 1 Treasure chest will have 3 tier (bronze = 500points, silver = 1000points, gold = 2000points). Bronze will spawn total 5, silver total 3, gold total 2. The points will be accumulated as long the play the game. To collect this, miners will have to pass the chest locations.
- 1 Treasure vault located random from the locations of the miners (minimum of 15 steps), this will be the finish line for the miners. Whenever miners reach this vault, the accumulating points from treasure chest will be multiplied by 3. Example if they collected 1 bronze chest and 2 silver chest, the total points collected is 7500.
- 30% of the grids will be walls, generate this at random. Make this variable so that i can change it later.
- chest will never spawn in wall cell.

GAMEPLAY
- 1 session per game consisting 2 miners ad 1 assassin. Assassins will spawn at the farthest location from both miners (edge of the map). Miners will spawn at bottom left and bottom right always.
- Turn based, starting from miner 1 then 2 then assassin and so on.
- If the turn is miner, then the navigator can move their respective pawn 1 direction by clicking the button (up, left, down, right) and so on. 
- If either miner meet at the same grid with assassin, then show the battle begin menu
- If a battle is resolved (offline), the admin can continue the game so that they can continue moving
- If miner lose, they respawn again at the starting point, the assassins also have the same rules. The admin can choose whos winning on admin screen.
- If either miner reach the treasure vault first, then they will be the winner. Other case, if assassins manage to kill all the miners, they won. Only one team will prevail.

LOBBY:
- Make the lobby, there will be a 3 pool. 2 for Team Miner 1 and 2 and 1 for Assassin
- When player join, they can join to their respective roles. In the miner pool there will consist of 2 inside pool, 1 for miner 1 for navigator.
- So the total number of player for 1 session is 5. (4 for each miner and navigator, and 1 assassin), only need 5 devices
- Admin join also using admin account with username 'ADMIN-GAME', if the username equals to 'ADMIN-GAME' then prompts for password, if the password is correct then they will be joining to the room as admin. The password will be '1357'
- Admin can start the game once all the players joins.
- The game will be played only by session, dont need for database.
- No need also for room code, because only 1 session will be running.

DESIGN:
- i want design that simple and dark style. 
- some fluent animations will be nice as well
- add options for choosing background music also