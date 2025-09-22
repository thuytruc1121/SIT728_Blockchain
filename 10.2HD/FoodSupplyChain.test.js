const Food = artifacts.require("FoodSupplyChain");

// Minimal local expectRevert helper to avoid external dependency
async function expectRevert(promise, expectedMessage) {
  try {
    await promise;
    assert.fail("Expected transaction to revert");
  } catch (error) {
    const message = (error && (error.reason || error.message)) || "";
    if (expectedMessage) {
      assert(
        message.includes(expectedMessage),
        `Expected revert containing "${expectedMessage}", got: "${message}"`
      );
    }
  }
}

contract("FoodSupplyChain", (accounts) => {
  const [alice, bob, carol, dave] = accounts; // alice: creator, bob: warehouse, carol: store, dave: random

  let food;
  beforeEach(async () => {
    food = await Food.new();
    // authorize roles
    await food.authorizeWarehouse(bob, { from: alice });
    await food.authorizeStore(carol, { from: alice });
  });

  it("creates a batch and sets creator as holder", async () => {
    await food.createBatch("Apples #1", "Green Farm", 0, 100, { from: alice });
    const count = await food.batchCount();
    assert.equal(count.toNumber(), 1);
    const b = await food.getBatch(1);
    assert.equal(b.holder, alice);
    assert.equal(b.creator, alice);
    assert.equal(b.stage.toNumber(), 0); // Created
    assert.equal(b.batchSize.toNumber(), 100);
  });

  it("only holder can advance", async () => {
    await food.createBatch("Apples #2", "Green Farm", 0, 50, { from: alice });
    await expectRevert(
      food.advanceStage(1, bob, { from: bob }),
      "Not the current holder"
    );
  });

  it("role-aware transitions set stage based on new holder role and update holder", async () => {
    await food.createBatch("Apples #3", "Green Farm", 0, 25, { from: alice });

    // Transfer to warehouse → Warehoused
    await food.advanceStage(1, bob, { from: alice });
    let b = await food.getBatch(1);
    assert.equal(b.stage.toNumber(), 2); // Warehoused
    assert.equal(b.holder, bob);

    // Transfer to store → Store
    await food.advanceStage(1, carol, { from: bob });
    b = await food.getBatch(1);
    assert.equal(b.stage.toNumber(), 3); // Store
    assert.equal(b.holder, carol);
  });

  it("cannot advance after Sold", async () => {
    await food.createBatch("Apples #4", "Green Farm", 0, 10, { from: alice });
    await food.advanceStage(1, bob, { from: alice });     // -> Warehoused (role-aware)
    await food.advanceStage(1, carol, { from: bob });     // -> Store (role-aware)
    await food.markAsSold(1, { from: carol });            // store + holder

    await expectRevert(
      food.advanceStage(1, carol, { from: carol }),
      "Already sold"
    );
  });

  it("only store and current holder can mark as sold", async () => {
    await food.createBatch("Apples #5", "Green Farm", 0, 5, { from: alice });

    // Move to store and holder = carol
    await food.advanceStage(1, bob, { from: alice });   // -> Warehoused
    await food.advanceStage(1, carol, { from: bob });   // -> Store

    // Not a store
    await expectRevert(
      food.markAsSold(1, { from: alice }),
      "Not authorized as store"
    );

    // Random account (not store)
    await expectRevert(
      food.markAsSold(1, { from: dave }),
      "Not authorized as store"
    );

    // Correct: carol is authorized store and current holder
    await food.markAsSold(1, { from: carol });
    const b = await food.getBatch(1);
    assert.equal(b.stage.toNumber(), 4); // Sold
  });

  it("markAsSold requires Store stage and proper roles", async () => {
    await food.createBatch("Apples #6", "Green Farm", 0, 60, { from: alice });

    // Directly try to mark from Created stage (not holder store)
    await expectRevert(
      food.markAsSold(1, { from: carol }),
      "Not the current holder"
    );

    // Move to warehouse, holder=bob (not store)
    await food.advanceStage(1, bob, { from: alice });   // -> Warehoused
    await expectRevert(
      food.markAsSold(1, { from: bob }),
      "Not authorized as store"
    );

    // Move to store, holder=carol, now can mark
    await food.advanceStage(1, carol, { from: bob });   // -> Store
    await food.markAsSold(1, { from: carol });
    const b = await food.getBatch(1);
    assert.equal(b.stage.toNumber(), 4); // Sold
  });

  it("only holder can update condition", async () => {
    await food.createBatch("Apples #7", "Green Farm", 0, 70, { from: alice });
    await expectRevert(
      food.updateCondition(1, false, { from: bob }),
      "Not the current holder"
    );

    await food.updateCondition(1, false, { from: alice });
    const b = await food.getBatch(1);
    assert.equal(b.conditionOk, false);
  });
});
