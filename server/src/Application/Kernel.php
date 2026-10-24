<?php

declare(strict_types=1);

namespace NasTech\Application;

use NasTech\Commissions\CommissionPolicy;
use NasTech\Commissions\CommissionPolicyRegistry;
use NasTech\Commissions\CommissionRecorder;
use NasTech\Handover\ConfirmHandover;
use NasTech\Handover\HandoverTokenStore;
use NasTech\Handover\ScheduleHandover;
use NasTech\Listings\Listing;
use NasTech\Listings\ListingRepository;
use NasTech\Orders\CompleteOrder;
use NasTech\Orders\CreateOrder;
use NasTech\Orders\OrderRepository;
use NasTech\Payments\PaymentInbox;
use NasTech\Payments\RecordProviderPayment;
use NasTech\Payments\WebhookVerifier;
use NasTech\Settlements\InitiateRefund;
use NasTech\Settlements\Ledger;
use NasTech\Settlements\MoneyInvariants;
use NasTech\Settlements\ReconcileSettlementFile;
use NasTech\Settlements\RequestPayout;
use NasTech\SharedKernel\Money;
use NasTech\Settlements\SettleRefund;
use NasTech\SharedKernel\Clock;
use NasTech\SharedKernel\Outbox;
use NasTech\SharedKernel\Persistence\InMemoryStore;
use NasTech\SharedKernel\Persistence\InMemoryUnitOfWork;
use NasTech\SharedKernel\Persistence\Schema;

/**
 * Composition root for the money path.
 *
 * The only place that knows about every module at once, which is the point: a
 * handler reaching across to another handler would mean the seams in the module
 * graph are decorative. Nothing here decides a business rule.
 */
final class Kernel
{
    public readonly Clock $clock;
    public readonly InMemoryStore $store;
    public readonly InMemoryUnitOfWork $uow;
    public readonly ListingRepository $listings;
    public readonly OrderRepository $orders;
    public readonly Ledger $ledger;
    public readonly PaymentInbox $inbox;
    public readonly CommissionPolicyRegistry $policies;
    public readonly CommissionRecorder $commission;
    public readonly Outbox $outbox;
    public readonly HandoverTokenStore $handoverTokens;
    public readonly CreateOrder $createOrder;
    public readonly RecordProviderPayment $recordPayment;
    public readonly CompleteOrder $completeOrder;
    public readonly InitiateRefund $initiateRefund;
    public readonly SettleRefund $settleRefund;
    public readonly RequestPayout $requestPayout;
    public readonly ScheduleHandover $scheduleHandover;
    public readonly ConfirmHandover $confirmHandover;
    public readonly ReconcileSettlementFile $reconcile;
    public readonly WebhookVerifier $webhooks;

    /**
     * @param list<CommissionPolicy> $commissionPolicies
     * @param non-empty-string       $webhookSecret
     * @param non-empty-string       $handoverPepper
     */
    public function __construct(
        array $commissionPolicies,
        string $webhookSecret,
        string $handoverPepper,
        Clock $clock,
    ) {
        $store = new InMemoryStore();
        Schema::apply($store);
        $uow = new InMemoryUnitOfWork($store);

        // Installed before anything can commit, so no handler can be written that forgets it.
        MoneyInvariants::install($uow, $store);

        $this->clock = $clock;
        $this->store = $store;
        $this->uow = $uow;
        $this->listings = new ListingRepository($store);
        $this->orders = new OrderRepository($store);
        $this->ledger = new Ledger($store, $uow, $clock);
        $this->inbox = new PaymentInbox($store, $clock);
        $this->policies = new CommissionPolicyRegistry($commissionPolicies);
        $this->commission = new CommissionRecorder($store, $this->ledger, $this->policies, $clock);
        $this->outbox = new Outbox($store, $uow, $clock);
        $this->handoverTokens = new HandoverTokenStore($store, $clock);

        $this->createOrder = new CreateOrder($uow, $this->listings, $this->orders, $this->outbox, $clock);
        $this->recordPayment = new RecordProviderPayment(
            $store, $uow, $this->orders, $this->inbox, $this->ledger, $this->commission, $this->outbox, $clock,
        );
        $this->completeOrder = new CompleteOrder($uow, $this->orders, $this->ledger, $this->outbox, $clock);
        $this->initiateRefund = new InitiateRefund($uow, $this->orders, $this->outbox);
        $this->settleRefund = new SettleRefund($uow, $this->orders, $this->ledger, $this->commission, $this->outbox);
        $this->requestPayout = new RequestPayout($store, $uow, $this->ledger, $this->outbox, $clock);
        $this->scheduleHandover = new ScheduleHandover(
            $uow, $this->orders, $this->handoverTokens, $this->outbox, $clock, $handoverPepper,
            new \DateInterval('PT48H'),
        );
        $this->confirmHandover = new ConfirmHandover(
            $uow, $this->orders, $this->handoverTokens, $this->outbox, $clock, $handoverPepper,
        );
        $this->reconcile = new ReconcileSettlementFile($this->ledger, $this->orders);
        $this->webhooks = new WebhookVerifier($store, $clock, $webhookSecret);
    }

    public function listing(string $id, string $title, string $sellerId, string $category, Money $price): void
    {
        $this->listings->save(new Listing($id, $title, $sellerId, $category, $price));
    }

    public function sellerBalance(string $sellerId): Money
    {
        return $this->ledger->sellerBalance($sellerId);
    }
}
