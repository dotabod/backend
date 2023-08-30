import { faker } from "@faker-js/faker"
import { PrismaClient as PrismaPsql } from "@dotabod/prisma/dist/psql/index.js"

const prisma = new PrismaPsql()

async function main() {
  for (let i = 0; i < 100; i++) {
    // Seed User data
    const user = await prisma.user.create({
      data: {
        displayName: faker.person.fullName(),
        email: faker.internet.email(),
        mmr: faker.number.int({ min: 0, max: 2000 }),
        name: faker.internet.userName(),
      },
    })

    // Seed Account data
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "basic",
        provider: "twitch",
        providerAccountId: faker.string.uuid(),
        refresh_token: faker.string.alphanumeric(30),
        access_token: faker.string.alphanumeric(30),
      },
    })

    // Seed Setting data
    await prisma.setting.create({
      data: {
        key: "theme",
        value: { selected: faker.helpers.arrayElement(["dark", "light"]) },
        userId: user.id,
      },
    })

    // Seed SteamAccount data
    await prisma.steamAccount.create({
      data: {
        steam32Id: faker.number.int({ min: 50_000, max: 70_000 }),
        userId: user.id,
        name: faker.internet.userName(),
      },
    })

    // Seed Bet data
    await prisma.bet.create({
      data: {
        matchId: faker.string.uuid(),
        predictionId: faker.string.uuid(),
        userId: user.id,
        myTeam: faker.helpers.arrayElement(["Radiant", "Dire"]),
      },
    })

    // Seed mods data
    await prisma.mods.create({
      data: {
        streamer_user_id: user.id,
        mod_user_id: null,
        temp_mod_name: faker.person.fullName(),
      },
    })

    // Seed streams data
    await prisma.streams.create({
      data: {
        id: faker.string.uuid(),
        userId: user.id,
        category_name: faker.helpers.arrayElement(["Gaming", "Education", "Cooking"]),
        title: faker.company.catchPhrase(),
      },
    })
  }

  console.log("Seeding finished.")
}
main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
